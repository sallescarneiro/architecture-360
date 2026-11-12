"use client";
// T-219 — formulário da atividade (criar/editar). Mesmos nomes, opções e códigos do Vobi: Nome da tarefa, Projeto, Etapa,
// Responsável, Data de início, Data de término (= prazo), Prioridade (Baixa/Média/Alta), Status (Planejado/Em andamento/
// Concluído/Cancelado), Duração estimada (h), Descrição. Validação definitiva no servidor (lerFormulario).
import { useMemo, useState } from "react";

type Pessoa = { id: number; nome: string; perfil: string; idVobi: number | null; idsVobi: number[] };
type Projeto = { codigo: number; nome: string; cliente: string | null };
type Etapa = { id: number; projeto: number; nome: string };
type Tarefa = { id: number; projeto: number; etapa: number | null; nome: string; resp: number | null; prioridade: number | null; status: number | null; inicio: string | null; fim: string | null; atividade: number | null };

export type ValoresAtividade = {
  vinculo: "independente" | "tarefa_existente" | "nova_tarefa"; tipo: string; titulo: string; descricao: string; responsavelId: number | null;
  dataInicio: string; horaInicio: string; dataFim: string; horaFim: string; diaInteiro: boolean; estimada: string; prioridade: number; status: number;
  projeto: number | null; etapa: number | null; tarefa: number | null;
};

const FUSO = "America/Sao_Paulo";
const dia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const hora = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const STATUS: [number, string][] = [[1, "Planejado"], [2, "Em andamento"], [4, "Concluído"], [5, "Cancelado"]];
const PRIOR: [number, string][] = [[1, "Baixa"], [2, "Média"], [3, "Alta"]];
const TIPOS: [string, string][] = [["reuniao_interna", "Reunião interna"], ["treinamento", "Treinamento"], ["estudo", "Estudo"], ["alinhamento", "Alinhamento"], ["administrativa", "Atividade administrativa"], ["outra", "Outra demanda gerencial"]];
const lbl = "block text-xs font-semibold text-[var(--txt-2)]";

export function FormularioAtividade({ action, valores, pessoas, projetos, etapas, tarefas, volta, id, edicao, erro, idAtividade }: {
  action: (fd: FormData) => Promise<void>; valores: ValoresAtividade; pessoas: Pessoa[]; projetos: Projeto[]; etapas: Etapa[]; tarefas: Tarefa[];
  volta: string; id?: number; edicao?: boolean; erro?: string; idAtividade?: number;
}) {
  const [v, setV] = useState(valores);
  const set = <K extends keyof ValoresAtividade>(k: K, x: ValoresAtividade[K]) => setV((o) => ({ ...o, [k]: x }));
  const vinculada = v.vinculo !== "independente";
  const etapasProj = useMemo(() => etapas.filter((e) => e.projeto === v.projeto), [etapas, v.projeto]);
  const tarefasProj = useMemo(() => tarefas.filter((t) => t.projeto === v.projeto && (!v.etapa || t.etapa === v.etapa) && (!t.atividade || t.atividade === idAtividade || t.id === v.tarefa)), [tarefas, v.projeto, v.etapa, v.tarefa, idAtividade]);
  const resp = pessoas.find((p) => p.id === v.responsavelId);
  const porVobi = useMemo(() => new Map(pessoas.flatMap((p) => p.idsVobi.map((i) => [i, p.id] as [number, number]))), [pessoas]);

  // escolher uma tarefa existente traz os valores dela (o mesmo prazo, sem duplicar)
  function escolherTarefa(idT: number | null) {
    const t = tarefas.find((x) => x.id === idT);
    if (!t) { set("tarefa", null); return; }
    setV((o) => ({
      ...o, tarefa: t.id, etapa: t.etapa ?? o.etapa, titulo: t.nome, prioridade: t.prioridade ?? o.prioridade, status: t.status ?? o.status,
      responsavelId: (t.resp != null ? porVobi.get(t.resp) : undefined) ?? o.responsavelId,
      dataInicio: t.inicio ? dia(t.inicio) : o.dataInicio, horaInicio: t.inicio ? hora(t.inicio) : o.horaInicio,
      dataFim: t.fim ? dia(t.fim) : o.dataFim, horaFim: t.fim ? hora(t.fim) : o.horaFim,
    }));
  }

  return (
    <form action={action} className="card flex flex-col gap-4 p-4">
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      <input type="hidden" name="volta" value={volta} />
      {id && <input type="hidden" name="id" value={id} />}

      <fieldset className="flex flex-col gap-2" disabled={edicao}>
        <legend className={lbl}>Atividade</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" name="vinculo" value="tarefa_existente" checked={v.vinculo === "tarefa_existente"} onChange={() => set("vinculo", "tarefa_existente")} /> programar uma tarefa que já existe no Vobi</label>
          <label className="flex items-center gap-2"><input type="radio" name="vinculo" value="nova_tarefa" checked={v.vinculo === "nova_tarefa"} onChange={() => { set("vinculo", "nova_tarefa"); set("tarefa", null); }} /> nova tarefa no projeto do Vobi</label>
          <label className="flex items-center gap-2"><input type="radio" name="vinculo" value="independente" checked={v.vinculo === "independente"} onChange={() => set("vinculo", "independente")} /> independente (sem projeto)</label>
        </div>
        {edicao && <input type="hidden" name="vinculo" value={v.vinculo} />}
      </fieldset>

      {vinculada ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className={lbl}>Projeto
            <select name="projeto" required className="input mt-1" value={v.projeto ?? ""} disabled={edicao} onChange={(e) => setV((o) => ({ ...o, projeto: e.target.value ? Number(e.target.value) : null, etapa: null, tarefa: null }))}>
              <option value="">— escolha —</option>
              {projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.cliente ? ` · ${p.cliente}` : ""}</option>)}
            </select>
            {edicao && <input type="hidden" name="projeto" value={v.projeto ?? ""} />}
          </label>
          <label className={lbl}>Etapa
            <select name="etapa" className="input mt-1" value={v.etapa ?? ""} onChange={(e) => set("etapa", e.target.value ? Number(e.target.value) : null)} disabled={!v.projeto}>
              <option value="">— sem etapa —</option>
              {etapasProj.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          {v.vinculo === "tarefa_existente" && (
            <label className={lbl}>Tarefa do Vobi
              <select name="tarefa" required className="input mt-1" value={v.tarefa ?? ""} disabled={edicao || !v.projeto} onChange={(e) => escolherTarefa(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— escolha —</option>
                {tarefasProj.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.fim ? ` · término ${dia(t.fim).split("-").reverse().join("/")}` : ""} (nº {t.id})</option>)}
              </select>
              {edicao && <input type="hidden" name="tarefa" value={v.tarefa ?? ""} />}
              {v.projeto && !tarefasProj.length && <span className="sub">nenhuma tarefa aberta sem programação neste projeto/etapa</span>}
            </label>
          )}
        </div>
      ) : (
        <label className={`${lbl} sm:w-80`}>Tipo
          <select name="tipo" required className="input mt-1" value={v.tipo} onChange={(e) => set("tipo", e.target.value)}>
            <option value="">— escolha —</option>
            {TIPOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        </label>
      )}

      <label className={lbl}>{vinculada ? "Nome da tarefa" : "Título"}
        <input name="titulo" required maxLength={200} value={v.titulo} onChange={(e) => set("titulo", e.target.value)} className="input mt-1" placeholder={vinculada ? "ex.: Planta de Layout" : "ex.: Treinamento de compatibilização"} />
      </label>

      <label className={`${lbl} sm:w-96`}>Responsável
        <select name="responsavel" required className="input mt-1" value={v.responsavelId ?? ""} onChange={(e) => set("responsavelId", e.target.value ? Number(e.target.value) : null)}>
          <option value="">— escolha —</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.perfil !== "arquiteta" ? " · gestão" : ""}</option>)}
        </select>
        {vinculada && resp && !resp.idVobi && <span className="sub">sem número do Vobi identificado em Pessoas: o responsável não poderá ser enviado ao Vobi até isso ser feito</span>}
      </label>

      <div className="grid gap-3 sm:grid-cols-[auto_auto_auto_auto_1fr] sm:items-end">
        <label className={lbl}>Data de início<input type="date" name="data_inicio" required value={v.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} className="input mt-1" /></label>
        <label className={lbl}>Hora<input type="time" name="hora_inicio" step={300} value={v.horaInicio} disabled={v.diaInteiro} onChange={(e) => set("horaInicio", e.target.value)} className="input mt-1" /></label>
        <label className={lbl}>Data de término (prazo)<input type="date" name="data_fim" required value={v.dataFim} onChange={(e) => set("dataFim", e.target.value)} className="input mt-1" /></label>
        <label className={lbl}>Hora<input type="time" name="hora_fim" step={300} value={v.horaFim} disabled={v.diaInteiro} onChange={(e) => set("horaFim", e.target.value)} className="input mt-1" /></label>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="dia_inteiro" value="1" checked={v.diaInteiro} onChange={(e) => set("diaInteiro", e.target.checked)} /> dia inteiro</label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={lbl}>Prioridade
          <select name="prioridade" className="input mt-1" value={v.prioridade} onChange={(e) => set("prioridade", Number(e.target.value))}>{PRIOR.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        </label>
        <label className={lbl}>Status
          <select name="status" className="input mt-1" value={v.status} disabled={v.vinculo === "tarefa_existente" || (edicao && vinculada)} onChange={(e) => set("status", Number(e.target.value))}>{STATUS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          {vinculada && <span className="sub">a execução (status) é atualizada pela arquiteta no Vobi</span>}
        </label>
        {v.vinculo === "nova_tarefa" && (
          <label className={lbl}>Duração estimada (h)<input type="number" name="estimada" min={0} max={9999} value={v.estimada} onChange={(e) => set("estimada", e.target.value)} className="input mt-1" /></label>
        )}
      </div>

      <label className={lbl}>Descrição<textarea name="descricao" rows={3} maxLength={4000} value={v.descricao} onChange={(e) => set("descricao", e.target.value)} className="input mt-1" placeholder="orientações para a arquiteta" /></label>

      {vinculada && <div className="leitura"><b>Vobi</b>Escrita desligada (Fase 0): {v.vinculo === "nova_tarefa" ? "a criação da tarefa" : "a mudança de programação"} fica registrada como “aguardando envio”. Nada é gravado no Vobi agora.</div>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
        <a className="btn btn-secondary" href={volta}>Cancelar</a>
        <button className="btn btn-primary" type="submit">{edicao ? "Salvar atividade" : "Programar atividade"}</button>
      </div>
    </form>
  );
}
