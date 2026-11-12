import { notFound, redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { apoioVinculo, obterAtividade, pessoasDaAgenda, podeGerirAgenda } from "@/lib/agenda/atividades";
import { hojeLocal, horaInput } from "@/lib/agenda/datas";
import { FormularioAtividade } from "@/components/agenda/FormularioAtividade";
import { LinkButton, PageHeader } from "@/components/ui";
import { editarAtividadeAction } from "../../actions";

export default async function EditarAtividadePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const { id } = await params;
  const sp = await searchParams;
  const a = await obterAtividade(u, Number(id));
  if (!a) notFound();
  const volta = sp.volta?.startsWith("/agenda") ? sp.volta : "/agenda";
  const [pessoas, apoio] = await Promise.all([pessoasDaAgenda(), apoioVinculo()]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Alterar atividade" subtitle="O vínculo e o projeto não mudam depois de criados." actions={<LinkButton href={`/agenda/atividade/${a.id}?volta=${encodeURIComponent(volta)}`}>← Voltar</LinkButton>} />
      <FormularioAtividade action={editarAtividadeAction} id={a.id} idAtividade={a.id} edicao volta={volta} erro={sp.erro} pessoas={pessoas} projetos={apoio.projetos} etapas={apoio.etapas} tarefas={apoio.tarefas}
        valores={{ vinculo: a.vinculo as never, tipo: a.tipo, titulo: a.titulo, descricao: a.descricao ?? "", responsavelId: a.responsavelId, dataInicio: hojeLocal(a.inicio), horaInicio: horaInput(a.inicio),
          dataFim: hojeLocal(a.fim), horaFim: horaInput(a.fim), diaInteiro: a.diaInteiro, estimada: a.estimadaHoras?.toString() ?? "", prioridade: a.prioridade, status: a.status,
          projeto: a.projetoCodigo, etapa: a.etapaVobiId, tarefa: a.tarefaVobiId }} />
    </div>
  );
}
