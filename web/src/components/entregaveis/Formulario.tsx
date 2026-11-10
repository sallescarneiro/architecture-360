import type { ProjetoRef } from "@/lib/agenda/classificacao";
import { TIPOS } from "@/lib/entregaveis";
import { Button, LinkButton } from "@/components/ui";

export type Valores = { titulo: string; tipo: string; descricao: string; projetoCodigo: number | null; responsavelId: number | null; reuniaoId: number | null };

/** Formulário de entregável (criar/editar). Server component; validação no servidor. */
export function FormularioEntregavel({ action, valores, projetos, usuarios, reunioes, volta, id, edicao, erro }: {
  action: (fd: FormData) => Promise<void>; valores: Valores; projetos: ProjetoRef[]; usuarios: { id: number; nome: string }[]; reunioes: { id: number; titulo: string }[];
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
          : <select name="projeto" required className="input mt-1" defaultValue={v.projetoCodigo ?? ""}><option value="">— escolha o projeto —</option>{projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}{p.cliente ? ` · ${p.cliente}` : ""} ({p.codigo})</option>)}</select>}
      </label>
      <label className="block text-xs font-semibold text-[var(--txt-2)]">Descrição / escopo do entregável<textarea name="descricao" rows={4} maxLength={4000} defaultValue={v.descricao} className="input mt-1" placeholder="O que este entregável contém e o que o cliente precisa aprovar." /></label>
      {reunioes.length > 0 && (
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Reunião de apresentação (opcional)
          <select name="reuniao" className="input mt-1" defaultValue={v.reuniaoId ?? ""}><option value="">— nenhuma —</option>{reunioes.map((r) => <option key={r.id} value={r.id}>{r.titulo}</option>)}</select>
        </label>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-3">
        <LinkButton href={volta}>Cancelar</LinkButton>
        <Button variant="primary">{edicao ? "Salvar alterações" : "Registrar entregável"}</Button>
      </div>
    </form>
  );
}
