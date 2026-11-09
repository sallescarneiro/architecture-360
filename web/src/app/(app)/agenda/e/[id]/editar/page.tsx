import { notFound, redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeEditar } from "@/lib/agenda/operacoes";
import { eventoDe } from "@/lib/agenda/sync";
import { apoioFormulario, voltaDe } from "@/lib/agenda/formulario";
import { diaDe, horaInput } from "@/lib/agenda/datas";
import { FormularioEvento } from "@/components/agenda/FormularioEvento";
import { LinkButton, PageHeader } from "@/components/ui";
import { editarEventoAction } from "../../../actions";

/** Edição: só o organizador, com permissão de escrita; grava no Google com If-Match (ETag). */
export default async function EditarEventoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = voltaDe(sp);
  if (!/^\d+$/.test(id)) notFound();
  const e = await eventoDe(u.id, Number(id));
  if (!e) notFound();
  const { c, projetos, calendarios, pessoas } = await apoioFormulario(u.id);
  if (!podeEditar(e, c)) redirect(`/agenda/e/${e.id}?erro=${encodeURIComponent("Só o organizador, com permissão de edição, pode alterar este compromisso.")}&volta=${encodeURIComponent(volta)}`);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Editar compromisso" subtitle="As alterações são gravadas no Google Agenda. Se o evento tiver mudado no Google desde a última sincronização, o A360 avisa em vez de sobrescrever." actions={<LinkButton href={`/agenda/e/${e.id}?volta=${encodeURIComponent(volta)}`}>← Voltar</LinkButton>} />
      <FormularioEvento action={editarEventoAction} id={e.id} edicao temMeet={Boolean(e.meetLink)} volta={volta} projetos={projetos} calendarios={calendarios} pessoas={pessoas} erro={sp.erro}
        valores={{ titulo: e.titulo ?? "", descricao: e.descricao ?? "", local: e.local ?? "", data: diaDe(e.inicio), diaInteiro: e.diaInteiro, horaInicio: e.diaInteiro ? "09:00" : horaInput(e.inicio), horaFim: e.diaInteiro ? "10:00" : horaInput(e.fim),
          participantes: e.participantes.map((p) => p.email).join(", "), projetoCodigo: e.projetoCodigo, criarMeet: false, calendarioId: e.calendarioId, enviarConvites: e.participantes.length > 0 }} />
    </div>
  );
}
