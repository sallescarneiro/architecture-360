import { notFound, redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { apoioFormulario } from "@/lib/agenda/formulario";
import { diaDe, horaInput } from "@/lib/agenda/datas";
import { podeEditar, reuniaoPorId } from "@/lib/reunioes";
import { opcoesMotivo } from "@/lib/reunioes-motivos";
import { FormularioReuniao } from "@/components/reunioes/FormularioReuniao";
import { LinkButton, PageHeader } from "@/components/ui";
import { editarReuniaoAction } from "../../actions";

const seguro = (s?: string) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "/reunioes");

export default async function EditarReuniaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = seguro(sp.volta);
  if (!/^\d+$/.test(id)) notFound();
  const r = await reuniaoPorId(Number(id)); if (!r) notFound();
  if (!(await podeEditar(u, r))) redirect(`/reunioes/${r.id}?erro=${encodeURIComponent("Você não pode alterar esta reunião.")}`);
  const [{ projetos, pessoas }, motivos] = await Promise.all([apoioFormulario(u.id), opcoesMotivo(r.motivoId)]);
  const naoClassificada = !r.motivoId || !r.origem || !r.projetoCodigo;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Inteligência de Reuniões · Reuniões" title="Editar reunião" subtitle="Toda alteração fica no histórico. O compromisso no Google Agenda, se houver, é alterado pela Agenda." actions={<LinkButton href={`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}`}>← Voltar</LinkButton>} />
      {naoClassificada && <div className="leitura"><b>Não classificada</b>Esta reunião foi registrada antes do motivo, da origem{r.projetoCodigo ? "" : " e do projeto obrigatório"}. Para salvar, informe {r.projetoCodigo ? "os dois" : "projeto, motivo e origem"}. Nada é classificado automaticamente e o histórico fica preservado.</div>}
      <FormularioReuniao action={editarReuniaoAction} id={r.id} edicao motivos={motivos} valores={{ titulo: r.titulo, projetoCodigo: r.projetoCodigo, motivoId: r.motivoId, origem: r.origem, data: diaDe(r.inicio), horaInicio: horaInput(r.inicio), horaFim: horaInput(r.fim), local: r.local ?? "", participantes: r.participantes.map((p) => (p.email ? (p.nome && p.nome !== p.email.split("@")[0] ? `${p.nome} <${p.email}>` : p.email) : p.nome)).join("\n"), pauta: r.pauta ?? "" }} projetos={projetos} pessoas={pessoas} volta={volta} erro={sp.erro} />
    </div>
  );
}
