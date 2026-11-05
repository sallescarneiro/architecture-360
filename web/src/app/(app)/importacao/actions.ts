"use server";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { LayoutInvalido, executarCarga, layouts, lerCsv } from "@/lib/importador/importador";

export type EstadoUpload = { erro?: string } | undefined;

/** Etapa 1–2: recebe os dois CSVs, valida, gera a prévia (nada gravado no modelo) e abre a tela de confirmação. */
export async function enviarAction(_prev: EstadoUpload, form: FormData): Promise<EstadoUpload> {
  const u = await exigirUsuario(["admin", "gestao"]);
  if (!podeImportar(u.perfil)) return { erro: "Sem permissão." };
  const fp = form.get("projetos"), ft = form.get("tarefas");
  const dataCarga = String(form.get("dataCarga") ?? "").trim() || new Date().toISOString().slice(0, 10);
  if (!(fp instanceof File) || !(ft instanceof File) || !fp.size || !ft.size) return { erro: "Envie os dois arquivos: Projetos.csv e Tarefas.csv." };
  const bufP = Buffer.from(await fp.arrayBuffer());
  const bufT = Buffer.from(await ft.arrayBuffer());

  let proj, tar;
  try {
    proj = lerCsv(bufP, layouts.projetos, fp.name);
    tar = lerCsv(bufT, layouts.tarefas, ft.name);
  } catch (e) {
    if (e instanceof LayoutInvalido) {
      await db.insert(schema.cargas).values({
        status: "recusada", motivo: e.message, dataCarga, enviadoPorId: u.id, arqProjetos: fp.name, arqTarefas: ft.name,
      });
      return { erro: e.message };
    }
    throw e;
  }

  const ultima = (await db.select().from(schema.cargas).where(eq(schema.cargas.status, "aceita")).orderBy(desc(schema.cargas.id)).limit(1))[0];
  if (ultima && ultima.hashProjetos === proj.hash && ultima.hashTarefas === tar.hash) {
    await db.insert(schema.cargas).values({
      status: "ignorada", motivo: `arquivos idênticos à carga ${ultima.id} (mesmo hash)`, dataCarga, enviadoPorId: u.id,
      arqProjetos: fp.name, hashProjetos: proj.hash, linhasProjetos: proj.linhas.length,
      arqTarefas: ft.name, hashTarefas: tar.hash, linhasTarefas: tar.linhas.length,
    });
    return { erro: `Estes arquivos são idênticos aos da carga ${ultima.id} já aceita. Nada a importar.` };
  }

  // descarta prévias antigas não confirmadas (uma prévia por vez)
  await db.update(schema.cargas).set({ status: "descartada", conteudoProjetos: null, conteudoTarefas: null, motivo: "substituída por nova prévia" })
    .where(eq(schema.cargas.status, "previa"));

  const [carga] = await db.insert(schema.cargas).values({
    status: "previa", dataCarga, enviadoPorId: u.id,
    arqProjetos: fp.name, hashProjetos: proj.hash, linhasProjetos: proj.linhas.length, conteudoProjetos: bufP,
    arqTarefas: ft.name, hashTarefas: tar.hash, linhasTarefas: tar.linhas.length, conteudoTarefas: bufT,
  }).returning({ id: schema.cargas.id });

  const rel = await executarCarga({ cargaId: carga.id, dataCarga, projetos: proj, tarefas: tar, modo: "previa" });
  await db.update(schema.cargas).set({ relatorio: rel, status: rel.status === "retida" ? "retida" : "previa", motivo: rel.motivo ?? null,
    conteudoProjetos: rel.status === "retida" ? null : bufP, conteudoTarefas: rel.status === "retida" ? null : bufT })
    .where(eq(schema.cargas.id, carga.id));
  redirect(`/importacao/${carga.id}`);
}

/** Etapa 7: confirma a prévia e grava em transação única. */
export async function confirmarAction(form: FormData) {
  const u = await exigirUsuario(["admin", "gestao"]);
  const id = Number(form.get("id"));
  const carga = (await db.select().from(schema.cargas).where(and(eq(schema.cargas.id, id), eq(schema.cargas.status, "previa"))).limit(1))[0];
  if (!carga || !carga.conteudoProjetos || !carga.conteudoTarefas) redirect(`/importacao/${id}`);
  const proj = lerCsv(Buffer.from(carga.conteudoProjetos), layouts.projetos, carga.arqProjetos ?? "Projetos.csv");
  const tar = lerCsv(Buffer.from(carga.conteudoTarefas), layouts.tarefas, carga.arqTarefas ?? "Tarefas.csv");
  try {
    const rel = await executarCarga({ cargaId: id, dataCarga: carga.dataCarga, projetos: proj, tarefas: tar, modo: "aplicar" });
    await db.update(schema.cargas).set({
      status: rel.status, motivo: rel.motivo ?? null, relatorio: rel, confirmadoPorId: u.id, confirmadoEm: new Date(),
      conteudoProjetos: null, conteudoTarefas: null,
    }).where(eq(schema.cargas.id, id));
  } catch (e) {
    await db.update(schema.cargas).set({ status: "erro", motivo: (e as Error).message, conteudoProjetos: null, conteudoTarefas: null }).where(eq(schema.cargas.id, id));
  }
  redirect(`/importacao/${id}`);
}

export async function descartarAction(form: FormData) {
  await exigirUsuario(["admin", "gestao"]);
  const id = Number(form.get("id"));
  await db.update(schema.cargas).set({ status: "descartada", motivo: "descartada pelo usuário", conteudoProjetos: null, conteudoTarefas: null })
    .where(and(eq(schema.cargas.id, id), eq(schema.cargas.status, "previa")));
  redirect("/importacao");
}
