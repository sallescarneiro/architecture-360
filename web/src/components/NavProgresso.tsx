"use client";
// T-308 — barra fina no topo enquanto a próxima página carrega (links internos e envio de formulários).
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function NavProgresso() {
  const ref = useRef<HTMLDivElement>(null);
  const caminho = usePathname(), busca = useSearchParams();
  useEffect(() => { // página nova chegou: completa e some (e garante que não fica presa)
    const el = ref.current; if (!el || !el.classList.contains("ativo")) return;
    el.classList.remove("ativo"); el.classList.add("fim");
  }, [caminho, busca]);
  useEffect(() => {
    let limite: ReturnType<typeof setTimeout> | undefined;
    const iniciar = () => {
      const el = ref.current; if (!el) return; el.classList.remove("fim"); void el.offsetWidth; el.classList.add("ativo");
      clearTimeout(limite); limite = setTimeout(() => { el.classList.remove("ativo"); el.classList.add("fim"); }, 12000); // nunca fica presa
    };
    const clique = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      iniciar();
    };
    const envio = () => iniciar();
    document.addEventListener("click", clique, true); document.addEventListener("submit", envio, true); // captura: antes do Link do Next
    return () => { clearTimeout(limite); document.removeEventListener("click", clique, true); document.removeEventListener("submit", envio, true); };
  }, []);
  return <div ref={ref} className="nav-progresso" aria-hidden />;
}
