import { seniores } from "@/lib/entregaveis";
import { exigirUsuario } from "@/lib/auth";
import { projetosParaAssociacao } from "@/lib/agenda/sync";
import { reunioesDoProjeto } from "@/lib/reunioes";
import { listarUsuarios } from "@/lib/auth";
import { FormularioEntregavel } from "@/components/entregaveis/Formulario";
import { LinkButton, PageHeader } from "@/components/ui";
import { criarEntregavelAction } from "../actions";

export default async function NovoEntregavelPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirUsuario();
  const sp = await searchParams;
  const projetoCodigo = /^\d+$/.test(sp.projeto ?? "") ? Number(sp.projeto) : null;
  const [projetos, usuarios, reunioes] = await Promise.all([projetosParaAssociacao(), listarUsuarios(), projetoCodigo ? reunioesDoProjeto(projetoCodigo) : Promise.resolve([])]);
  const volta = projetoCodigo ? `/projetos/${projetoCodigo}` : "/entregaveis";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Entregáveis" title="Novo entregável" subtitle="Registro interno do que será apresentado ao cliente. Anexe já o arquivo ou o link, se tiver, e indique a arquiteta sênior que revisa. A revisão segue: sênior, coordenação e gerência." actions={<LinkButton href={volta}>← Voltar</LinkButton>} />
      <FormularioEntregavel action={criarEntregavelAction} valores={{ titulo: "", tipo: "layout", descricao: "", projetoCodigo, responsavelId: null, reuniaoId: null, revisorId: null }} projetos={projetos} seniores={await seniores()} usuarios={usuarios.filter((x) => x.ativo).map((x) => ({ id: x.id, nome: x.nome }))} reunioes={reunioes.map((r) => ({ id: r.id, titulo: r.titulo }))} volta={volta} erro={sp.erro} />
    </div>
  );
}
