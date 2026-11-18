"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { NavLinks, type NavGroup } from "@/components/nav-links";

/**
 * Celular e tablet: a mesma navegação da lateral, como painel sobreposto ao conteúdo.
 * Abre pelo botão Menu; fecha pelo X, clicando fora, com ESC ou ao trocar de página. O fundo não rola enquanto está aberto.
 * O CSS (.mtop/.mpainel) só o exibe abaixo do ponto em que a lateral fixa do computador aparece.
 */
export function MenuMovel({ groups, marca, rodape }: { groups: NavGroup[]; marca: ReactNode; rodape: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const path = usePathname();
  const botao = useRef<HTMLButtonElement>(null), fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => { setAberto(false); }, [path]);
  useEffect(() => {
    if (!aberto) return;
    const html = document.documentElement, antes = html.style.overflow;
    html.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", esc);
    fechar.current?.focus();
    const b = botao.current;
    return () => { html.style.overflow = antes; document.removeEventListener("keydown", esc); b?.focus(); };
  }, [aberto]);

  return (
    <>
      <header className="mtop side">
        {marca}
        <button ref={botao} type="button" className="btn btn-ghost btn-sm mbotao" aria-expanded={aberto} aria-controls="menu-movel" onClick={() => setAberto(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          Menu
        </button>
      </header>
      <div className="mpainel" data-aberto={aberto ? "1" : "0"} aria-hidden={!aberto}>
        <div className="mfundo" onClick={() => setAberto(false)} />
        <aside id="menu-movel" className="side mlateral" role="dialog" aria-modal="true" aria-label="Menu de navegação" inert={!aberto ? true : undefined}>
          <div className="flex items-start justify-between gap-2 px-1.5">
            {marca}
            <button ref={fechar} type="button" className="btn btn-ghost btn-sm" aria-label="Fechar menu" onClick={() => setAberto(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="flex-1" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setAberto(false); }}><NavLinks groups={groups} /></div>
          {rodape}
        </aside>
      </div>
    </>
  );
}
