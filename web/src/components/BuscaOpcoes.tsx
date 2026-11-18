"use client";

import { useRef, type ReactNode } from "react";

/** Campo de busca acima de uma lista de projetos: filtra as opções por nome, cliente ou nº do Vobi e já seleciona a primeira que bate. */
export function BuscaOpcoes({ children, placeholder = "buscar por nome, cliente ou nº do Vobi" }: { children: ReactNode; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const filtrar = (q: string) => {
    const sel = ref.current?.querySelector("select");
    if (!sel) return;
    const t = norm(q.trim());
    let primeira: HTMLOptionElement | null = null;
    for (const o of Array.from(sel.options)) {
      const bate = !t || !o.value || norm(o.text).includes(t);
      o.hidden = !bate; o.disabled = !bate && !!o.value;
      if (bate && o.value && !primeira) primeira = o;
    }
    if (t && primeira && (sel.selectedOptions[0]?.disabled || !sel.value)) { sel.value = primeira.value; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  return (
    <div ref={ref} className="flex flex-col gap-1">
      <input type="search" className="input" placeholder={placeholder} aria-label="Buscar projeto" onChange={(e) => filtrar(e.target.value)} />
      {children}
    </div>
  );
}
