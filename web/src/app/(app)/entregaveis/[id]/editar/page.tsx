import { notFound, redirect } from "next/navigation";
import { exigirUsuario, listarUsuarios } from "@/lib/auth";
import { projetosParaAssociacao } from "@/lib/agenda/sync";
import { reunioesDoProjeto } from "@/lib/reunioes";
import { podeEditar, porId } from "@/lib/entregaveis";
import { FormularioEntregavel } from "@/components/entregaveis/Formulario";
import { LinkButton, PageHeader } from "@/components/ui";
import { editarEntregavelAction } from "../../actions";

export default async function EditarEntregavelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams;
  const e = /^\d+$/.test(id) ? await porId(Number(id)) : null;
  if (!e) notFound();
  if (!(await podeEditar(u, e))) redirect("/sem-permissao");
  const [projetos, usuarios, reunioes] = await Promise.all([projetosParaAssociacao(), listarUsuarios(), reunioesDoProjeto(e.projetoCodigo)]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Entregáveis" title="Editar entregável" subtitle={e.titulo} actions={<LinkButton href={`/entregaveis/${e.id}`}>← Voltar</LinkButton>} />
      <FormularioEntregavel action={editarEntregavelAction} id={e.id} edicao valores={{ titulo: e.titulo, tipo: e.tipo, descricao: e.descricao ?? "", projetoCodigo: e.projetoCodigo, responsavelId: e.responsavelId, reuniaoId: e.reuniaoId }} projetos={projetos} usuarios={usuarios.filter((x) => x.ativo).map((x) => ({ id: x.id, nome: x.nome }))} reunioes={reunioes.map((r) => ({ id: r.id, titulo: r.titulo }))} volta={`/entregaveis/${e.id}`} erro={sp.erro} />
    </div>
  );
}
