// T-218 — Sincronização diária com a API do Vobi (somente leitura). Substitui o envio manual dos CSV; o CSV fica como contingência.
// Fluxo: lê a API → monta os arquivos no layout v1 → mesma prévia do importador → aplica sozinho quando não há anomalia.
// Fica aguardando conferência (prévia) a PRIMEIRA sincronização pela API e qualquer carga que o importador retenha.
import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { executarCarga } from "@/lib/importador/importador";
import { ErroVobi, apiConfigurada, lerVobi } from "./api";
import { montarArquivos } from "./adaptador";

export type ResultadoSinc = { cargaId: number | null; status: string; mensagem: string };
export const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const horaSP = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));

let emAndamento = false;

export async function sincronizarVobi(opts: { disparo: "agenda" | "manual"; usuarioId?: number }): Promise<ResultadoSinc> {
  if (!apiConfigurada()) return { cargaId: null, status: "nao_configurada", mensagem: "A integração com a API do Vobi ainda não está configurada no Railway." };
  if (emAndamento) return { cargaId: null, status: "em_andamento", mensagem: "Já há uma sincronização em andamento." };
  emAndamento = true;
  const dataCarga = hojeSP();
  const nomes = { arqProjetos: "API Vobi · projetos", arqTarefas: "API Vobi · tarefas" };
  const [carga] = await db.insert(schema.cargas).values({
    status: "sincronizando", origem: "api", tipo: "operacao", dataCarga, enviadoPorId: opts.usuarioId ?? null, ...nomes,
    motivo: opts.disparo === "agenda" ? "sincronização diária automática" : "sincronização pedida na tela de importação",
  }).returning({ id: schema.cargas.id });
  const id = carga.id;
  try {
    // andamento visível na tela da carga (atualizado no máximo a cada 5 s)
    const NOMES: Record<string, string> = { "/v2/refurbish": "projetos", "/v2/refurbish/{id}": "projetos encerrados", "/v2/task": "tarefas", "/v2/refurbish-step": "etapas", "/v2/step": "etapas de projeto", "/v2/company-customer": "clientes" };
    let ultimoAviso = 0;
    const codigosBase = (await db.select({ c: schema.projetos.codigo }).from(schema.projetos).where(isNull(schema.projetos.naoEncontradoDesde))).map((r) => r.c);
    const leitura = await lerVobi(async (caminho, lidos, total) => {
      if (Date.now() - ultimoAviso < 5000) return;
      ultimoAviso = Date.now();
      await db.update(schema.cargas).set({ motivo: `lendo o Vobi: ${NOMES[caminho] ?? caminho} ${lidos.toLocaleString("pt-BR")}${total != null ? ` de ${total.toLocaleString("pt-BR")}` : ""}` }).where(eq(schema.cargas.id, id));
    }, codigosBase);
    await db.update(schema.cargas).set({ motivo: "leitura concluída; comparando com a base" }).where(eq(schema.cargas.id, id));
    const m = await montarArquivos(leitura);
    // id → nome resolvidos por correspondência com a última exportação: guardados (não sobrescrevem definição manual)
    for (const r of m.diagnostico.responsaveis.novosPorCorrespondencia) {
      await db.insert(schema.vobiResponsaveis).values({ idVobi: r.id, nome: r.nome, origem: "auto_csv" }).onConflictDoNothing();
    }
    const meta = {
      hashProjetos: m.projetos.hash, linhasProjetos: m.projetos.linhas.length, hashTarefas: m.tarefas.hash, linhasTarefas: m.tarefas.linhas.length,
      arqClientes: m.clientes ? "API Vobi · clientes" : null, hashClientes: m.clientes?.hash ?? null, linhasClientes: m.clientes?.linhas.length ?? null,
    };

    // nada mudou no Vobi desde a última carga aceita → registra e não reprocessa
    const ultima = (await db.select().from(schema.cargas).where(and(eq(schema.cargas.status, "aceita"), isNotNull(schema.cargas.hashTarefas)))
      .orderBy(desc(schema.cargas.id)).limit(1))[0];
    if (ultima && ultima.hashProjetos === m.projetos.hash && ultima.hashTarefas === m.tarefas.hash && (!m.clientes || ultima.hashClientes === m.clientes.hash)) {
      await db.update(schema.cargas).set({ status: "ignorada", motivo: `sem mudanças no Vobi desde a carga ${ultima.id}`, ...meta, relatorio: { api: m.diagnostico } })
        .where(eq(schema.cargas.id, id));
      return { cargaId: id, status: "ignorada", mensagem: `Vobi sem mudanças desde a carga ${ultima.id}.` };
    }

    // prévias antigas da própria API são substituídas; prévia de CSV enviada por alguém fica intacta
    await db.update(schema.cargas).set({ status: "descartada", conteudoProjetos: null, conteudoTarefas: null, conteudoClientes: null, motivo: "substituída por nova sincronização" })
      .where(and(eq(schema.cargas.status, "previa"), eq(schema.cargas.origem, "api")));
    await db.update(schema.cargas).set({ status: "previa", ...meta }).where(eq(schema.cargas.id, id));

    const previa = await executarCarga({ cargaId: id, dataCarga, projetos: m.projetos, tarefas: m.tarefas, clientes: m.clientes, modo: "previa" });
    if (previa.status === "retida") {
      await db.update(schema.cargas).set({ status: "retida", motivo: previa.motivo ?? null, relatorio: { ...previa, api: m.diagnostico } }).where(eq(schema.cargas.id, id));
      return { cargaId: id, status: "retida", mensagem: `Carga retida para conferência: ${previa.motivo}` };
    }
    const jaAceitouApi = (await db.select({ id: schema.cargas.id }).from(schema.cargas)
      .where(and(eq(schema.cargas.origem, "api"), eq(schema.cargas.status, "aceita"))).limit(1)).length > 0;
    if (!jaAceitouApi) {
      await db.update(schema.cargas).set({
        motivo: "primeira sincronização pela API: conferir a prévia e confirmar (as seguintes entram sozinhas)", relatorio: { ...previa, api: m.diagnostico },
        conteudoProjetos: m.bufProjetos, conteudoTarefas: m.bufTarefas, conteudoClientes: m.bufClientes ?? null,
      }).where(eq(schema.cargas.id, id));
      return { cargaId: id, status: "previa", mensagem: "Primeira sincronização pela API pronta para conferência." };
    }
    const rel = await executarCarga({ cargaId: id, dataCarga, projetos: m.projetos, tarefas: m.tarefas, clientes: m.clientes, modo: "aplicar" });
    await db.update(schema.cargas).set({ status: rel.status, motivo: rel.motivo ?? "sincronização automática aplicada", relatorio: { ...rel, api: m.diagnostico }, confirmadoEm: new Date() })
      .where(eq(schema.cargas.id, id));
    return { cargaId: id, status: rel.status, mensagem: rel.status === "aceita" ? "Sincronização aplicada." : `Carga ${rel.status}: ${rel.motivo ?? ""}` };
  } catch (e) {
    const msg = e instanceof ErroVobi ? e.message : `falha na sincronização: ${(e as Error).message}`.slice(0, 500);
    await db.update(schema.cargas).set({ status: "erro", motivo: msg, conteudoProjetos: null, conteudoTarefas: null, conteudoClientes: null }).where(eq(schema.cargas.id, id));
    return { cargaId: id, status: "erro", mensagem: msg };
  } finally {
    emAndamento = false;
  }
}

/** Ao subir o serviço nada está sincronizando: o que ficou "sincronizando" foi interrompido pelo reinício. */
export async function limparInterrompidas(): Promise<void> {
  await db.update(schema.cargas).set({ status: "erro", motivo: "sincronização interrompida (reinício do serviço)" })
    .where(and(eq(schema.cargas.origem, "api"), eq(schema.cargas.status, "sincronizando")));
}

/** Agenda diária: a partir das 06:00 (Brasília), uma sincronização por dia; se falhar, nova tentativa a cada hora (até 3 no dia). */
export async function verificarAgenda(): Promise<void> {
  if (!apiConfigurada() || process.env.VOBI_SYNC_AUTO === "off" || horaSP() < 6 || emAndamento) return;
  // sincronização interrompida (reinício do serviço no meio da leitura) não bloqueia o dia
  await db.update(schema.cargas).set({ status: "erro", motivo: "sincronização interrompida (reinício do serviço)" })
    .where(and(eq(schema.cargas.origem, "api"), eq(schema.cargas.status, "sincronizando"), lt(schema.cargas.criadoEm, new Date(Date.now() - 30 * 60_000))));
  const inicioDia = new Date(`${hojeSP()}T00:00:00-03:00`);
  const hoje = await db.select({ status: schema.cargas.status, criadoEm: schema.cargas.criadoEm, motivo: schema.cargas.motivo }).from(schema.cargas)
    .where(and(eq(schema.cargas.origem, "api"), gte(schema.cargas.criadoEm, inicioDia))).orderBy(desc(schema.cargas.id));
  if (hoje.some((c) => c.status !== "erro")) return; // já sincronizou hoje (ou está sincronizando)
  if (hoje.length >= 3) return;
  const interrompida = hoje[0]?.motivo?.startsWith("sincronização interrompida");
  if (hoje[0] && !interrompida && Date.now() - hoje[0].criadoEm.getTime() < 55 * 60_000) return;
  await sincronizarVobi({ disparo: "agenda" });
}
