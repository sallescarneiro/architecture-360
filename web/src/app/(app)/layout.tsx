import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { sairAction } from "@/app/login/actions";
import { NavLinks, type NavGroup } from "@/components/nav-links";
import { Avatar } from "@/components/ui";

const PERFIL: Record<string, string> = { admin: "Administração", gestao: "Gestão", coordenacao: "Coordenação", arquiteta: "Arquiteta" };

/**
 * Chrome no padrão do Rucelle 360 (topo branco fixo + lateral branca + fundo nude), aprovado em 08/11/2026 (T-196).
 * Hierarquia de marca: RUCELLE 360° / Architecture 360 · Central de Trabalho — módulo de operação de arquitetura.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const gestao = veIndicadoresIndividuais(u.perfil);
  const groups: NavGroup[] = [
    { label: "Central de Trabalho", items: [
      { href: "/meu-dia", label: "Meu dia", icon: "home" },
      ...(gestao ? [{ href: "/painel", label: "Painel de Gestão", icon: "ads" as const }] : []), // T-199: coordenação, gestão e admin
      { href: "/tarefas", label: "Tarefas", icon: "tasks" },
      { href: "/projetos", label: "Projetos", icon: "bolt" },
      { href: "/agenda", label: "Agenda", icon: "calendar" as const }, // T-187: própria agenda (todos os perfis)
      { href: "/reunioes", label: "Reuniões", icon: "users" as const }, // T-188: reuniões com pauta, ata e encaminhamentos
      { href: "/qualidade", label: "Qualidade dos dados", icon: "check" },
    ] },
    { label: "Dados", items: [
      { href: "/clientes", label: "Clientes", icon: "tag" },
      { href: "/importacao", label: "Importação Vobi", icon: "upload" },
      ...(gestao ? [{ href: "/pessoas", label: "Pessoas", icon: "users" as const }] : []),
    ] },
  ];
  const marca = (
    <Link href="/" className="marca flex items-baseline gap-2">
      <span className="text-[var(--vinho)]">RUCELLE <span>360°</span></span>
      <small className="hidden sm:inline">Architecture 360 · Central de Trabalho</small>
    </Link>
  );
  const me = (
    <div className="flex items-center gap-2.5">
      <Avatar name={u.nome} size={28} />
      <span className="hidden min-w-0 text-[0.8rem] leading-tight md:block"><span className="block truncate font-semibold">{u.nome}</span><span className="block truncate text-[0.7rem] text-[var(--muted)]">{PERFIL[u.perfil] ?? u.perfil}</span></span>
      <form action={sairAction}><button className="btn btn-ghost btn-sm" title="Sair">Sair</button></form>
    </div>
  );
  return (
    <div className="min-h-screen">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <header className="topo">
        <div className="flex items-center gap-3">
          <details className="mnav relative lg:hidden">
            <summary className="btn btn-secondary btn-sm cursor-pointer" aria-label="Abrir menu">Menu</summary>
            <div className="side absolute left-0 top-[2.6rem] z-40 w-64 rounded-[12px] border border-[var(--line)] p-3 shadow-[var(--shadow-pop)]"><NavLinks groups={groups} /></div>
          </details>
          {marca}
        </div>
        <div className="flex items-center gap-3"><span className="selo hidden md:inline">Vobi · somente leitura</span>{me}</div>
      </header>
      <div className="lg:grid lg:grid-cols-[var(--sidebar)_1fr]">
        <aside className="side sticky top-[var(--topo)] hidden h-[calc(100vh-var(--topo))] flex-col overflow-y-auto px-3 py-4 lg:flex">
          <NavLinks groups={groups} />
        </aside>
        <main id="conteudo" className="min-w-0 px-4 py-5 md:px-7 md:py-6"><div className="mx-auto max-w-[1480px]">{children}</div></main>
      </div>
    </div>
  );
}
