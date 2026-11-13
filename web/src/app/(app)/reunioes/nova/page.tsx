import { exigirUsuario } from "@/lib/auth";
import { podeEscrever } from "@/lib/agenda/google";
import { eventoDe } from "@/lib/agenda/sync";
import { apoioFormulario } from "@/lib/agenda/formulario";
import { diaDe, diaValido, hojeLocal, horaInput } from "@/lib/agenda/datas";
import { opcoesMotivo } from "@/lib/reunioes-motivos";
import { FormularioReuniao } from "@/components/reunioes/FormularioReuniao";
import { LinkButton, PageHeader } from "@/components/ui";
import { criarReuniaoAction } from "../actions";

const seguro = (s?: string) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "/reunioes");

/** Nova reunião: em branco, a partir de um projeto (?projeto=) ou de um compromisso da Agenda (?evento=). */
export default async function NovaReuniaoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams; const volta = seguro(sp.volta);
  const [{ c, projetos, pessoas }, motivos] = await Promise.all([apoioFormulario(u.id), opcoesMotivo()]);
  const ev = /^\d+$/.test(sp.evento ?? "") ? await eventoDe(u.id, Number(sp.evento)) : null;
  const base = { titulo: "", projetoCodigo: /^\d+$/.test(sp.projeto ?? "") ? Number(sp.projeto) : null, data: diaValido(sp.d) ? sp.d : hojeLocal(), horaInicio: "09:00", horaFim: "10:00", local: "", participantes: "", pauta: "" };
  const valores = ev && !ev.privado ? { titulo: ev.titulo ?? "", projetoCodigo: ev.projetoCodigo ?? base.projetoCodigo, data: diaDe(ev.inicio), horaInicio: ev.diaInteiro ? "09:00" : horaInput(ev.inicio), horaFim: ev.diaInteiro ? "10:00" : horaInput(ev.fim), local: ev.local ?? "", participantes: ev.participantes.map((p) => (p.nome ? `${p.nome} <${p.email}>` : p.email)).join("\n"), pauta: ev.descricao ?? "" } : base;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Inteligência de Reuniões · Reuniões" title="Nova reunião" subtitle={ev ? "A partir do compromisso da Agenda: confira e complete os dados." : "Toda reunião pertence a um projeto de arquitetura; o cliente vem do projeto. A gravação e a transcrição entram depois, na página da reunião."} actions={<LinkButton href={volta}>← Voltar</LinkButton>} />
      <FormularioReuniao action={criarReuniaoAction} valores={valores} projetos={projetos} motivos={motivos} pessoas={pessoas} volta={volta} eventoId={ev && !ev.privado ? ev.id : null} podeAgenda={Boolean(c && c.estado !== "revogada" && podeEscrever(c.escopos))} erro={sp.erro} />
    </div>
  );
}
