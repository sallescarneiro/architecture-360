"use server";
import { redirect } from "next/navigation";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { LayoutInvalido, executarCarga, layouts, lerClientes, lerCsv, type ArquivoLido, type Relatorio } from "@/lib/importador/importador";

export type EstadoUpload = { erro?: string } | undefined;

/**
 * Recebe Projetos+Tarefas (carga de operação) e/ou Clientes (opcional; sozinho = carga só de clientes), valida,
 * gera a prévia (nada gravado no modelo) e abre a tela de confirmação. O Vobi nunca é alterado.
 */
export async function enviarAction(_prev: EstadoUpload, form: FormData): Promise<EstadoUpload> {
  const u = await exigirUsuario(["admin", "gestao"]);
  if (!podeImportar(u.perfil)) return { erro: "Sem permissão." };
  const arq = (k: string) => { const f = form.get(k); return f instanceof File && f.size ? f : null; };
  const fp = arq("projetos"), ft = arq("tarefas"), fc = arq("clientes");
  const dataCarga = String(form.get("dataCarga") ?? "").trim() || new Date().toISOString().slice(0, 10);
  if ((fp && !ft) || (!fp && ft)) return { erro: "Projetos.csv e Tarefas.csv vão sempre juntos." };
  if (!fp && !fc) return { erro: "Envie Projetos.csv + Tarefas.csv (carga de operação) e/ou Clientes.csv." };
  const tipo = fp ? "operacao" : "clientes";
  const nomes = { arqProjetos: fp?.name ?? null, arqTarefas: ft?.name ?? null, arqClientes: fc?.name ?? null };

  let proj: ArquivoLido | undefined, tar: ArquivoLido | undefined, cli: ArquivoLido | undefined;
  let bufP: Buffer | undefined, bufT: Buffer | undefined, bufC: Buffer | undefined;
  try {
    if (fp && ft) {
      bufP = Buffer.from(await fp.arrayBuffer()); bufT = Buffer.from(await ft.arrayBuffer());
      proj = lerCsv(bufP, layouts.projetos, fp.name);
      tar = lerCsv(bufT, layouts.tarefas, ft.name);
    }
    if (fc) {
      // só as colunas autorizadas seguem adiante; o arquivo original não é guardado
      const r = lerClientes(Buffer.from(await fc.arrayBuffer()), fc.name);
      cli = r.arq; bufC = r.csvAutorizado;
    }
  } catch (e) {
    if (e instanceof LayoutInvalido) {
      await db.insert(schema.cargas).values({ status: "recusada", tipo, motivo: e.message, dataCarga, enviadoPorId: u.id, ...nomes });
      return { erro: e.message };
    }
    throw e;
  }

  const meta = {
    ...nomes, hashProjetos: proj?.hash ?? null, linhasProjetos: proj?.linhas.length ?? null,
    hashTarefas: tar?.hash ?? null, linhasTarefas: tar?.linhas.length ?? null,
    hashClientes: cli?.hash ?? null, linhasClientes: cli?.linhas.length ?? null,
  };
  // idênticos à última carga aceita de cada tipo de arquivo? (mesmo hash)
  const ultimaOp = proj ? (await db.select().from(schema.cargas).where(and(eq(schema.cargas.status, "aceita"), isNotNull(schema.cargas.hashProjetos))).orderBy(desc(schema.cargas.id)).limit(1))[0] : undefined;
  const ultimaCli = cli ? (await db.select().from(schema.cargas).where(and(eq(schema.cargas.status, "aceita"), isNotNull(schema.cargas.hashClientes))).orderBy(desc(schema.cargas.id)).limit(1))[0] : undefined;
  const opIgual = !proj || (!!ultimaOp && ultimaOp.hashProjetos === proj.hash && ultimaOp.hashTarefas === tar?.hash);
  const cliIgual = !cli || (!!ultimaCli && ultimaCli.hashClientes === cli.hash);
  if (opIgual && cliIgual) {
    const ref = [ultimaOp?.id, ultimaCli?.id].filter(Boolean).join(" e ");
    await db.insert(schema.cargas).values({ status: "ignorada", tipo, motivo: `arquivos idênticos à(s) carga(s) ${ref} (mesmo hash)`, dataCarga, enviadoPorId: u.id, ...meta });
    return { erro: `Estes arquivos são idênticos aos da(s) carga(s) ${ref} já aceita(s). Nada a importar.` };
  }

  // descarta prévias antigas não confirmadas (uma prévia por vez)
  await db.update(schema.cargas).set({ status: "descartada", conteudoProjetos: null, conteudoTarefas: null, conteudoClientes: null, motivo: "substituída por nova prévia" })
    .where(eq(schema.cargas.status, "previa"));

  const [carga] = await db.insert(schema.cargas).values({
    status: "previa", tipo, dataCarga, enviadoPorId: u.id, ...meta, conteudoProjetos: bufP, conteudoTarefas: bufT, conteudoClientes: bufC,
  }).returning({ id: schema.cargas.id });

  const rel = await executarCarga({ cargaId: carga.id, dataCarga, projetos: proj, tarefas: tar, clientes: cli, modo: "previa" });
  const retida = rel.status === "retida";
  await db.update(schema.cargas).set({ relatorio: rel, status: retida ? "retida" : "previa", motivo: rel.motivo ?? null,
    conteudoProjetos: retida ? null : bufP, conteudoTarefas: retida ? null : bufT, conteudoClientes: retida ? null : bufC })
    .where(eq(schema.cargas.id, carga.id));
  redirect(`/importacao/${carga.id}`);
}

/** Etapa 7: confirma a prévia e grava em transação única. */
export async function confirmarAction(form: FormData) {
  const u = await exigirUsuario(["admin", "gestao"]);
  const id = Number(form.get("id"));
  const carga = (await db.select().from(schema.cargas).where(and(eq(schema.cargas.id, id), eq(schema.cargas.status, "previa"))).limit(1))[0];
  const temOp = !!(carga?.conteudoProjetos && carga.conteudoTarefas), temCli = !!carga?.conteudoClientes;
  if (!carga || (!temOp && !temCli)) redirect(`/importacao/${id}`);
  const proj = temOp ? lerCsv(Buffer.from(carga.conteudoProjetos!), layouts.projetos, carga.arqProjetos ?? "Projetos.csv") : undefined;
  const tar = temOp ? lerCsv(Buffer.from(carga.conteudoTarefas!), layouts.tarefas, carga.arqTarefas ?? "Tarefas.csv") : undefined;
  const cli = temCli ? lerCsv(Buffer.from(carga.conteudoClientes!), layouts.clientesA360, carga.arqClientes ?? "Clientes.csv") : undefined;
  const limpa = { conteudoProjetos: null, conteudoTarefas: null, conteudoClientes: null };
  try {
    const rel = await executarCarga({ cargaId: id, dataCarga: carga.dataCarga, projetos: proj, tarefas: tar, clientes: cli, modo: "aplicar" });
    await db.update(schema.cargas).set({ status: rel.status, motivo: rel.motivo ?? null, relatorio: { ...rel, api: (carga.relatorio as Relatorio | null)?.api }, confirmadoPorId: u.id, confirmadoEm: new Date(), ...limpa })
      .where(eq(schema.cargas.id, id));
  } catch (e) {
    await db.update(schema.cargas).set({ status: "erro", motivo: (e as Error).message, ...limpa }).where(eq(schema.cargas.id, id));
  }
  redirect(`/importacao/${id}`);
}

export async function descartarAction(form: FormData) {
  await exigirUsuario(["admin", "gestao"]);
  const id = Number(form.get("id"));
  await db.update(schema.cargas).set({ status: "descartada", motivo: "descartada pelo usuário", conteudoProjetos: null, conteudoTarefas: null, conteudoClientes: null })
    .where(and(eq(schema.cargas.id, id), eq(schema.cargas.status, "previa")));
  redirect("/importacao");
}

/** T-218: "Sincronizar agora" — mesma rotina da agenda diária, pedida por admin/gestão. */
export async function sincronizarAgoraAction() {
  const u = await exigirUsuario(["admin", "gestao"]);
  const { sincronizarVobi } = await import("@/lib/vobi/sincronizar");
  const r = await sincronizarVobi({ disparo: "manual", usuarioId: u.id });
  redirect(r.cargaId ? `/importacao/${r.cargaId}` : `/importacao?sinc=${encodeURIComponent(r.status)}`);
}
