import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { sairAction } from "@/app/login/actions";
import { NavLinks, type NavGroup } from "@/components/nav-links";
import { Avatar } from "@/components/ui";
import { trilhaDoPerfil } from "@/lib/treinamento";

const PERFIL: Record<string, string> = { admin: "Administração", gestao: "Gestão", coordenacao: "Coordenação", arquiteta: "Arquiteta" };

/**
 * Casca no padrão das demais plataformas da rucelle (Central de Operações / Radar): lateral vinho com a marca "rucelle",
 * usuário no rodapé da lateral, fundo nude e cartões brancos — pedido de Rodrigo em 11/11/2026 (T-212), substitui o padrão de 08/11.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  if (u.trocarSenha) redirect("/conta/senha"); // T-205: senha provisória → troca obrigatória antes de qualquer tela
  const gestao = veIndicadoresIndividuais(u.perfil);
  const groups: NavGroup[] = [
    { label: "Central de Trabalho", items: [
      { href: "/meu-dia", label: "Meu dia", icon: "home" },
      ...(gestao ? [{ href: "/painel", label: "Painel de Gestão", icon: "ads" as const }] : []), // T-199: coordenação, gestão e admin
      { href: "/tarefas", label: "Tarefas", icon: "tasks" },
      { href: "/projetos", label: "Projetos", icon: "bolt" },
      { href: "/agenda", label: "Agenda", icon: "calendar" as const }, // T-187: própria agenda (todos os perfis)
      { href: "/entregaveis", label: "Entregáveis", icon: "check" as const }, // T-190: versões, revisão interna e aprovação do cliente com evidência
      ...(gestao ? [{ href: "/alertas", label: "Alertas", icon: "bell" as const }] : []), // T-188: divergências e correção de rota
      ...(gestao ? [{ href: "/capacidade", label: "Capacidade e fluxo", icon: "tasks" as const }] : []), // T-189: distribuição, carga por semana, entregas, etapas
      { href: "/qualidade", label: "Qualidade dos dados", icon: "check" },
    ] },
    // T-227: Inteligência de Reuniões (reuniões técnicas dos projetos)
    { label: "Inteligência de Reuniões", items: [
      { href: "/reunioes", label: "Reuniões", icon: "users" as const },
      { href: "/reunioes/clientes", label: "Histórico por cliente", icon: "tag" as const },
      ...(u.perfil === "admin" || u.perfil === "gestao" ? [{ href: "/reunioes/motivos", label: "Motivos da reunião", icon: "check" as const }] : []),
    ] },
    { label: "Dados", items: [
      { href: "/clientes", label: "Clientes", icon: "tag" },
      { href: "/importacao", label: "Importação Vobi", icon: "upload" },
      ...(gestao ? [{ href: "/pessoas", label: "Pessoas", icon: "users" as const }] : []),
      ...(u.perfil === "admin" ? [{ href: "/usuarios", label: "Usuários", icon: "users" as const }] : []), // T-205: acessos e perfis (só admin)
    ] },
    { label: "Ajuda", items: [{ href: `/treinamento/${trilhaDoPerfil(u.perfil)}`, label: "Como usar o A360", icon: "check" as const }] }, // T-213: trilha de treinamento por perfil
  ];
  const marca = (
    <Link href="/" className="block leading-none no-underline">
      <span className="marca-r">rucelle</span>
      <span className="marca-sub">Architecture 360</span>
    </Link>
  );
  const me = (
    <div className="flex items-center gap-2.5 border-t border-white/10 pt-3">
      <span className="rounded-full ring-2 ring-white/30"><Avatar name={u.nome} size={30} /></span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[0.84rem] font-semibold text-white">{u.nome}</span>
        <span className="flex items-center gap-1.5 text-[0.68rem] text-[#e2c3b9]"><span className="truncate">{PERFIL[u.perfil] ?? u.perfil}</span>·<Link href="/conta/senha" className="text-[#f1dcd5] underline-offset-2 hover:text-white hover:underline" title="Alterar minha senha">senha</Link>·<form action={sairAction} className="inline"><button className="text-[#f1dcd5] underline-offset-2 hover:text-white hover:underline" title="Sair">sair</button></form></span>
      </span>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--sidebar)_1fr]">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>

      {/* Computador: lateral fixa no padrão da Central de Operações (T-212) */}
      <aside className="side sticky top-0 hidden h-screen flex-col gap-4 overflow-y-auto px-3.5 py-5 lg:flex">
        <div className="px-1.5">{marca}</div>
        <div className="flex-1"><NavLinks groups={groups} /></div>
        <div className="px-1.5"><span className="selo">Vobi · somente leitura</span></div>
        {me}
      </aside>

      {/* Celular e tablet: a mesma lateral, recolhível */}
      <details className="mnav side sticky top-0 z-30 lg:hidden">
        <summary className="flex items-center justify-between px-4 py-3">
          {marca}
          <span className="btn btn-ghost btn-sm" aria-hidden="true">Menu</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-white/10 px-3.5 pb-4 pt-2">
          <NavLinks groups={groups} />
          <div className="px-1.5"><span className="selo">Vobi · somente leitura</span></div>
          {me}
        </div>
      </details>

      <main id="conteudo" className="min-w-0 px-4 py-5 md:px-7 md:py-6"><div className="w-full">{children}</div></main>
    </div>
  );
}
