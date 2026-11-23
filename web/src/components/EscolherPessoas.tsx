"use client";

/** Botões com as pessoas da rucelle: um toque acrescenta "Nome <email>" ao campo de participantes (sem apagar o que já foi digitado). */
export function EscolherPessoas({ pessoas, campo, separador = "\n" }: { pessoas: { email: string; nome: string | null; rotulo?: string }[]; campo: string; separador?: string }) {
  if (!pessoas.length) return null;
  const add = (p: { email: string; nome: string | null }, el: HTMLElement) => {
    const f = el.closest("form")?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${campo}"]`);
    if (!f) return;
    if (f.value.toLowerCase().includes(p.email.toLowerCase())) return;
    const item = separador === "\n" && p.nome ? `${p.nome} <${p.email}>` : p.email;
    f.value = f.value.trim() ? `${f.value.trim().replace(/[,\s]+$/, "")}${separador === "\n" ? "\n" : ", "}${item}` : item;
    f.dispatchEvent(new Event("input", { bubbles: true }));
  };
  // primeiro nome; quando dois têm o mesmo primeiro nome (Ana Paula e Ana Batitucci), mostra também o segundo
  const prim = (p: { email: string; nome: string | null }) => (p.nome ?? p.email).split(" ")[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const rot = (p: { email: string; nome: string | null; rotulo?: string }) => {
    if (p.rotulo) return p.rotulo;
    const partes = (p.nome ?? p.email).split(" ");
    return pessoas.filter((o) => prim(o) === prim(p)).length > 1 ? partes.slice(0, 2).join(" ") : partes[0];
  };
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Convidar pessoas da rucelle">
      <span className="text-[0.7rem] font-normal text-[var(--muted)]">Convidar:</span>
      {pessoas.map((p) => (
        <button key={p.email} type="button" onClick={(e) => add(p, e.currentTarget)} title={p.email}
          className="rounded-full border border-[var(--line)] bg-white px-2 py-0.5 text-[0.72rem] font-semibold text-[var(--txt-2)] hover:border-[var(--vinho)] hover:text-[var(--vinho)]">
          + {rot(p)}
        </button>
      ))}
    </div>
  );
}
