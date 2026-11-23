import type { ProjetoRef } from "@/lib/agenda/classificacao";
import { BuscaOpcoes } from "@/components/BuscaOpcoes";
import { TIPOS } from "@/lib/entregaveis";
import { Button, LinkButton } from "@/components/ui";

export type Valores = { titulo: string; tipo: string; descricao: string; projetoCodigo: number | null; responsavelId: number | null; reuniaoId: number | null; revisorId: number | null };

/** Formulário de entregável (criar/editar). Server component; validação no servidor. */
export function FormularioEntregavel({ action, valores, projetos, usuarios, seniores, reunioes, volta, id, edicao, erro }: {
  action: (fd: FormData) => Promise<void>; valores: Valores; projetos: ProjetoRef[]; usuarios: { id: number; nome: string }[]; seniores: { id: number; nome: string }[]; reunioes: { id: number; titulo: string }[];
  volta: string; id?: number; edicao?: boolean; erro?: string;
}) {
  const v = valores;
  return (
    <form action={action} className="card flex flex-col gap-4 p-4">
      {erro && <div className="leitura leitura-bad"><b>Erro</b>{erro}</div>}
      {id && <input type="hidden" name="id" value={id} />}
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Título<input name="titulo" required maxLength={200} defaultValue={v.titulo} className="input mt-1" placeholder="ex.: Layout da área de musculação — anteprojeto" autoFocus /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Tipo
          <select name="tipo" className="input mt-1" defaultValue={v.tipo || "layout"}>{Object.entries(TIPOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Responsável (A360)
          <select name="responsavel" className="input mt-1" defaultValue={v.responsavelId ?? ""}><option value="">— quem está criando —</option>{usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Projeto / cliente (Vobi, só leitura)
        {edicao ? <><input type="hidden" name="projeto" value={v.projetoCodigo ?? ""} /><div className="input mt-1 bg-[var(--surface-2)]">{projetos.find((p) => p.codigo === v.projetoCodigo)?.nome ?? v.projetoCodigo} <span className="text-xs text-[var(--muted)]">(não muda)</span></div></>
          : <BuscaOpcoes><select name="projeto" required className="input mt-1" defaultValue={v.projetoCodigo ?? ""}><option value="">— escolha o projeto —</option>{projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} — nº {p.codigo}{p.cliente ? ` · ${p.cliente}` : ""}</option>)}</select></BuscaOpcoes>}
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Revisão sênior com
        <select name="revisor" className="input mt-1" defaultValue={v.revisorId ?? ""}><option value="">— só quando a responsável é júnior —</option>{seniores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
        <span className="mt-1 block font-normal text-[var(--muted)]">A revisão interna segue esta ordem: arquiteta sênior, coordenação e gerência. Quando a responsável é sênior, começa na coordenação.</span>
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Descrição / escopo do entregável<textarea name="descricao" rows={4} maxLength={4000} defaultValue={v.descricao} className="input mt-1" placeholder="O que este entregável contém e o que o cliente precisa aprovar." /></label>
      {reunioes.length > 0 && (
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Reunião de apresentação (opcional)
          <select name="reuniao" className="input mt-1" defaultValue={v.reuniaoId ?? ""}><option value="">— nenhuma —</option>{reunioes.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}</select>
        </label>
      )}
      {!edicao && (
        <fieldset className="grid gap-3 rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--txt-2)]">Arquivo ou link da versão 1 (opcional)</legend>
          <p className="text-xs text-[var(--muted)]">Se já tiver o material, anexe aqui: o entregável nasce com a v1 e vai direto para a revisão. Pode deixar para depois.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-[var(--txt-2)]">Links (Drive, Vobi…), um por linha<textarea name="link" rows={3} className="input mt-1" placeholder={"pode pôr um nome antes do link\nPlanta baixa: https://drive.google.com/..."} /></label>
            <label className="block text-xs font-semibold text-[var(--txt-2)]">ou arquivo (até 15 MB)<input type="file" name="arquivo" className="input mt-1" /></label>
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
        <LinkButton href={volta}>Cancelar</LinkButton>
        <Button variant="primary">{edicao ? "Salvar alterações" : "Registrar entregável"}</Button>
      </div>
    </form>
  );
}
