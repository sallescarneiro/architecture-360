// T-219 Fase 1 — ENSAIO da escrita no Vobi (autorizado por Rodrigo em 12/11/2026). NADA é enviado: este módulo não faz
// nenhuma chamada HTTP. Para cada pedido da fila monta o pedido exato que seria gravado (método, endereço, corpo) com os
// dados reais do A360 e do espelho do Vobi, confere as regras do plano e registra o resultado em vobi_envio.simulacao.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CamposVobi, Simulacao } from "@/db/schema";
import { mapaResponsaveis } from "./espelho";
import { camposDaTarefa, CAMPOS_PROGRAMACAO, NOME_CAMPO, reconciliar, type Campo } from "./reconciliar";

export const ESCRITA_VOBI = "desligada" as const; // VOBI_ESCRITA permanece desligada — não há código de envio
const MARCA = (id: number) => `Programada no A360 · atividade ${id}`;

/** Corpo no formato da API v2 (TaskCreate / TaskUpdate). */
function corpoApi(c: CamposVobi): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (c.nome !== undefined) o.name = c.nome;
  if (c.idEtapa !== undefined) o.idRefurbishStep = c.idEtapa;
  if (c.idResponsavel !== undefined) o.idResponsible = c.idResponsavel;
  if (c.inicio !== undefined) o.startDate = c.inicio;
  if (c.fim !== undefined) o.endDate = c.fim;
  if (c.prioridade !== undefined) o.priority = c.prioridade;
  if (c.status !== undefined) o.status = c.status;
  return o;
}

export async function simularEnvio(envioId: number): Promise<Simulacao | null> {
  const e = (await db.select().from(schema.vobiEnvios).where(eq(schema.vobiEnvios.id, envioId)))[0];
  if (!e || e.estado !== "aguardando") return null;
  const a = (await db.select().from(schema.atividades).where(eq(schema.atividades.id, e.atividadeId)))[0];
  const problemas: Simulacao["problemas"] = [];
  const bloqueia = (texto: string) => problemas.push({ nivel: "bloqueia", texto });
  const aviso = (texto: string) => problemas.push({ nivel: "aviso", texto });
  const { vobiParaUsuario } = await mapaResponsaveis();
  let metodo: Simulacao["metodo"] = null, caminho: string | null = null, corpo: Record<string, unknown> | null = null, chamadas = 0;

  if (!a) bloqueia("atividade não encontrada");
  else {
    const c = e.campos ?? {};
    // validações comuns dos valores que iriam ao Vobi
    if ("nome" in c && !String(c.nome ?? "").trim()) bloqueia("Nome da tarefa vazio");
    if ("inicio" in c && c.inicio && Number.isNaN(Date.parse(c.inicio))) bloqueia("Data de início inválida");
    if ("fim" in c && c.fim && Number.isNaN(Date.parse(c.fim))) bloqueia("Data de término inválida");
    const ini = c.inicio ?? a.inicio.toISOString(), fim = c.fim ?? a.fim.toISOString();
    if (Date.parse(fim) < Date.parse(ini)) bloqueia("Data de término antes da data de início");
    if ("prioridade" in c && ![1, 2, 3].includes(Number(c.prioridade))) bloqueia("Prioridade fora dos códigos do Vobi (1, 2, 3)");
    if ("status" in c && ![1, 2, 4, 5].includes(Number(c.status))) bloqueia("Status fora dos códigos do Vobi (1, 2, 4, 5)");
    if ("idResponsavel" in c && c.idResponsavel != null && !vobiParaUsuario.has(c.idResponsavel)) aviso(`responsável nº ${c.idResponsavel} sem acesso correspondente no A360`);
    const usuarioTemNumero = [...vobiParaUsuario.values()].includes(a.responsavelId);
    if (!usuarioTemNumero) bloqueia("a responsável não tem número do Vobi identificado em Pessoas — o responsável não pode ir ao Vobi");
    if (a.estadoVobi === "conflito") bloqueia(`atividade em conflito (${Object.keys(a.conflitos ?? {}).map((k) => NOME_CAMPO[k as Campo] ?? k).join(", ")}): a gestão precisa decidir antes`);
    if ("idEtapa" in c && c.idEtapa != null) {
      const et = (await db.select().from(schema.vobiEtapas).where(eq(schema.vobiEtapas.idVobi, c.idEtapa)))[0];
      if (!et) bloqueia(`etapa nº ${c.idEtapa} não está no espelho do Vobi`);
      else if (a.projetoCodigo && et.idRefurbish !== a.projetoCodigo) bloqueia("a etapa não é do projeto da atividade");
    }
    if (a.projetoCodigo) {
      const p = (await db.select({ classe: schema.projetos.statusClasse, ausente: schema.projetos.naoEncontradoDesde }).from(schema.projetos).where(eq(schema.projetos.codigo, a.projetoCodigo)))[0];
      if (!p) bloqueia(`projeto nº ${a.projetoCodigo} não está na base`);
      else if (p.ausente) bloqueia("o projeto não foi encontrado na última leitura do Vobi");
      else if (p.classe === "encerrado") aviso("projeto encerrado no Vobi");
    }

    if (e.operacao === "criar") {
      metodo = "POST"; caminho = "/v2/task"; chamadas = 2; // procura da marca (duplicidade) + criação
      if (a.tarefaVobiId) bloqueia(`a atividade já está ligada à tarefa nº ${a.tarefaVobiId}: criar de novo duplicaria`);
      if (!a.projetoCodigo) bloqueia("nova tarefa sem projeto");
      const outros = await db.select({ id: schema.vobiEnvios.id }).from(schema.vobiEnvios)
        .where(and(eq(schema.vobiEnvios.atividadeId, a.id), eq(schema.vobiEnvios.operacao, "criar"), inArray(schema.vobiEnvios.estado, ["aguardando", "enviado"])));
      if (outros.length > 1) bloqueia(`há ${outros.length} pedidos de criação para a mesma atividade`);
      // tarefa com o mesmo nome já existe no projeto? (possível duplicidade por fora do A360)
      const mesmoNome = (await db.execute(sql`select id_vobi from vobi_tarefa where id_refurbish = ${a.projetoCodigo} and lower(nome) = lower(${String(c.nome ?? a.titulo)}) and ausente_desde is null limit 3`)).rows as { id_vobi: number }[];
      if (mesmoNome.length) aviso(`já existe no projeto tarefa com o mesmo nome (nº ${mesmoNome.map((r) => r.id_vobi).join(", ")}): confira se não é a mesma — se for, ligue a atividade a ela em vez de criar`);
      corpo = { ...corpoApi({ status: 1, prioridade: 2, ...c }), idRefurbish: a.projetoCodigo, ...(a.estimadaHoras != null ? { estimativeDuration: a.estimadaHoras } : {}), description: [MARCA(a.id), a.descricao].filter(Boolean).join("\n\n") };
      if (!corpo.name) bloqueia("Nome da tarefa é obrigatório no Vobi");
    } else {
      // atualizar / cancelar: confere o espelho (o envio real lê a tarefa na hora antes de gravar) e envia TODOS os campos
      // de programação — proteção para o caso de o Vobi apagar campos que não vierem no corpo (a comprovar na escrita real)
      metodo = "PUT"; caminho = a.tarefaVobiId ? `/v2/task/${a.tarefaVobiId}` : null; chamadas = 2; // GET de conferência + PUT
      const t = a.tarefaVobiId ? (await db.select().from(schema.vobiTarefas).where(eq(schema.vobiTarefas.idVobi, a.tarefaVobiId)))[0] : undefined;
      if (!a.tarefaVobiId) bloqueia("atividade sem tarefa do Vobi ligada");
      else if (!t) bloqueia(`tarefa nº ${a.tarefaVobiId} não está no espelho do Vobi (aguarde a leitura diária)`);
      else if (t.ausenteDesde) bloqueia(`tarefa nº ${a.tarefaVobiId} não existe mais no Vobi (divergência)`);
      if (t && !t.ausenteDesde) {
        const atual = camposDaTarefa(t);
        const rec = reconciliar(a.baseVobi, c, atual);
        if (Object.keys(rec.conflitos).length) bloqueia(`a tarefa mudou no Vobi no mesmo campo: ${Object.keys(rec.conflitos).map((k) => NOME_CAMPO[k as Campo]).join(", ")} — iria para Conflitos, nada seria gravado`);
        if (a.baseVobi?.atualizadoVobiEm && t.atualizadoVobiEm && Date.parse(a.baseVobi.atualizadoVobiEm) !== t.atualizadoVobiEm.getTime() && !Object.keys(rec.conflitos).length)
          aviso("a tarefa mudou no Vobi em outros campos desde a última leitura combinada: as mudanças seriam combinadas");
        if (!Object.keys(rec.pendentes).length) aviso("nada a enviar: o Vobi já está com os valores programados");
        if (t.status === 4 && e.operacao !== "cancelar") aviso("a tarefa já está Concluída no Vobi");
        if (e.operacao === "cancelar" && t.status === 4) bloqueia("cancelar uma tarefa já Concluída no Vobi: decisão da gestão");
        // corpo completo: valores atuais do Vobi + o que a gestão mudou
        const completo: CamposVobi = {};
        for (const k of CAMPOS_PROGRAMACAO) (completo as Record<string, unknown>)[k] = k in rec.pendentes ? rec.pendentes[k] : atual[k];
        if (e.operacao === "cancelar") completo.status = 5;
        corpo = corpoApi(completo);
        for (const k of CAMPOS_PROGRAMACAO) if (completo[k] == null) aviso(`${NOME_CAMPO[k]} vazio no corpo (como está no Vobi)`);
      }
    }
  }
  const sim: Simulacao = { resultado: problemas.some((p) => p.nivel === "bloqueia") ? "bloqueado" : "pronto", metodo, caminho, corpo, chamadas, problemas };
  await db.update(schema.vobiEnvios).set({ simulacao: sim, simuladoEm: new Date() }).where(eq(schema.vobiEnvios.id, envioId));
  return sim;
}

/** Ensaia todos os pedidos aguardando. Nenhuma chamada ao Vobi. */
export async function ensaiarFila(): Promise<{ total: number; prontos: number; bloqueados: number; chamadas: number }> {
  const fila = await db.select({ id: schema.vobiEnvios.id }).from(schema.vobiEnvios).where(eq(schema.vobiEnvios.estado, "aguardando"));
  let prontos = 0, bloqueados = 0, chamadas = 0;
  for (const { id } of fila) {
    const s = await simularEnvio(id);
    if (!s) continue;
    if (s.resultado === "pronto") prontos++; else bloqueados++;
    chamadas += s.chamadas;
  }
  return { total: fila.length, prontos, bloqueados, chamadas };
}

/**
 * Cobertura com os dados reais: das tarefas abertas do Vobi (espelho), quantas poderiam ser programadas e enviadas hoje
 * (responsável com acesso no A360, etapa conhecida, datas). Mostra onde o envio real travaria antes de existir atividade.
 */
export async function coberturaEnsaio() {
  const [r] = (await db.execute(sql`
    with resp as (select vr.id_vobi from vobi_responsavel vr join pessoa_vobi pv on pv.nome_vobi = vr.nome join usuario u on lower(u.email) = lower(pv.email_rucelle) and u.ativo)
    select count(*)::int abertas,
      count(*) filter (where t.id_responsavel is null)::int sem_responsavel,
      count(*) filter (where t.id_responsavel is not null and t.id_responsavel not in (select id_vobi from resp))::int responsavel_sem_acesso,
      count(*) filter (where t.id_etapa is null)::int sem_etapa,
      count(*) filter (where t.id_etapa is not null and not exists (select 1 from vobi_etapa e where e.id_vobi = t.id_etapa))::int etapa_desconhecida,
      count(*) filter (where t.fim is null)::int sem_termino,
      count(*) filter (where t.inicio is not null and t.fim is not null and t.fim < t.inicio)::int termino_antes_inicio,
      count(*) filter (where t.id_responsavel in (select id_vobi from resp) and t.id_etapa is not null and t.fim is not null and (t.inicio is null or t.fim >= t.inicio))::int programaveis
    from vobi_tarefa t where t.ausente_desde is null and coalesce(t.status, 1) in (1, 2)`)).rows as Record<string, number>[];
  const semAcesso = (await db.execute(sql`select t.id_responsavel id, count(*)::int n from vobi_tarefa t
      where t.ausente_desde is null and coalesce(t.status,1) in (1,2) and t.id_responsavel is not null
      and t.id_responsavel not in (select vr.id_vobi from vobi_responsavel vr join pessoa_vobi pv on pv.nome_vobi = vr.nome join usuario u on lower(u.email) = lower(pv.email_rucelle) and u.ativo)
      group by 1 order by 2 desc`)).rows as { id: number; n: number }[];
  const espelho = (await db.execute(sql`select (select count(*)::int from vobi_tarefa) tarefas, (select count(*)::int from vobi_etapa) etapas, (select max(visto_em) from vobi_tarefa) lido_em`)).rows[0] as { tarefas: number; etapas: number; lido_em: string | null };
  return { ...Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [k, Number(v)])), semAcesso, espelho } as {
    abertas: number; sem_responsavel: number; responsavel_sem_acesso: number; sem_etapa: number; etapa_desconhecida: number; sem_termino: number; termino_antes_inicio: number; programaveis: number;
    semAcesso: { id: number; n: number }[]; espelho: { tarefas: number; etapas: number; lido_em: string | null };
  };
}
