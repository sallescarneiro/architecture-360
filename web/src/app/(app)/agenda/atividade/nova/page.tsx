import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { apoioVinculo, pessoasDaAgenda, podeGerirAgenda } from "@/lib/agenda/atividades";
import { diaValido, hojeLocal, horaInput } from "@/lib/agenda/datas";
import { FormularioAtividade, type ValoresAtividade } from "@/components/agenda/FormularioAtividade";
import { LinkButton, PageHeader } from "@/components/ui";
import { criarAtividadeAction } from "../actions";

/** T-219 — programar atividade (só gestão). ?tarefa= abre já ligada a uma tarefa do Vobi (clique num prazo da agenda). */
export default async function NovaAtividadePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const sp = await searchParams;
  const volta = sp.volta?.startsWith("/agenda") ? sp.volta : "/agenda";
  const [pessoas, apoio] = await Promise.all([pessoasDaAgenda(), apoioVinculo()]);
  const data = diaValido(sp.d) ? sp.d : hojeLocal();
  const h = /^\d{2}:\d{2}$/.test(sp.h ?? "") ? sp.h! : "09:00";
  const hf = `${String(Math.min(23, Number(h.slice(0, 2)) + 1)).padStart(2, "0")}:${h.slice(3)}`;
  const n = (s?: string) => (s && /^\d+$/.test(s) ? Number(s) : null);
  const t = apoio.tarefas.find((x) => x.id === n(sp.tarefa));
  if (t?.atividade) redirect(`/agenda/atividade/${t.atividade}?volta=${encodeURIComponent(volta)}&erro=${encodeURIComponent("Essa tarefa do Vobi já está programada nesta atividade.")}`);
  const porVobi = new Map(pessoas.flatMap((p) => p.idsVobi.map((i) => [i, p.id] as [number, number])));
  const ref = (iso: string | null) => (iso ? new Date(iso) : null);
  const ti = ref(t?.inicio ?? null), tf = ref(t?.fim ?? null);
  const valores: ValoresAtividade = t ? {
    vinculo: "tarefa_existente", tipo: "", titulo: t.nome, descricao: "", responsavelId: (t.resp != null ? porVobi.get(t.resp) : null) ?? null,
    dataInicio: ti ? hojeLocal(ti) : data, horaInicio: ti ? horaInput(ti) : h, dataFim: tf ? hojeLocal(tf) : data, horaFim: tf ? horaInput(tf) : hf,
    diaInteiro: false, estimada: "", prioridade: t.prioridade ?? 2, status: t.status ?? 1, projeto: t.projeto, etapa: t.etapa, tarefa: t.id,
  } : {
    vinculo: n(sp.projeto) ? "tarefa_existente" : "independente", tipo: "", titulo: "", descricao: "", responsavelId: n(sp.pessoa),
    dataInicio: data, horaInicio: h, dataFim: data, horaFim: hf, diaInteiro: false, estimada: "", prioridade: 2, status: 1, projeto: n(sp.projeto), etapa: null, tarefa: null,
  };
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Programar atividade" subtitle="Distribuição de atividades para as arquitetas. Prazo = Data de término, o mesmo campo da tarefa no Vobi." actions={<LinkButton href={volta}>← Voltar</LinkButton>} />
      <FormularioAtividade action={criarAtividadeAction} valores={valores} pessoas={pessoas} projetos={apoio.projetos} etapas={apoio.etapas} tarefas={apoio.tarefas} volta={volta} erro={sp.erro} />
    </div>
  );
}
