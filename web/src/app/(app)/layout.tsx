import Link from "next/link";
import { exigirUsuario, podeImportar, veIndicadoresIndividuais } from "@/lib/auth";
import { sairAction } from "@/app/login/actions";
import { NavLinks, type NavGroup } from "@/components/nav-links";
import { Avatar } from "@/components/ui";

const PERFIL: Record<string, string> = { admin: "Administração", gestao: "Gestão", coordenacao: "Coordenação", arquiteta: "Arquiteta" };

/** Mesma estrutura da Central de Operações: barra lateral agrupada no desktop e menu recolhível no celular. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const groups: NavGroup[] = [
    { label: "Operação", items: [
      { href: "/", label: "Operação", icon: "home" },
      { href: "/qualidade", label: "Qualidade dos dados", icon: "check" },
    ] },
    { label: "Dados", items: [
      { href: "/importacao", label: "Importação Vobi", icon: "upload" },
      ...(veIndicadoresIndividuais(u.perfil) ? [{ href: "/pessoas", label: "Pessoas", icon: "users" as const }] : []),
    ] },
  ];
  const brand = <Link href="/" className="block leading-none"><span className="display text-[1.55rem] text-white">rucelle</span><span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-[#d7a99b]">Architecture 360</span></Link>;
  const me = (
    <div className="flex items-center gap-2.5 border-t border-white/10 pt-3">
      <span className="rounded-full ring-2 ring-white/30"><Avatar name={u.nome} size={32} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[0.85rem] font-semibold text-white">{u.nome}</span><span className="block truncate text-[0.7rem] text-[#e2c3b9]">{PERFIL[u.perfil] ?? u.perfil}</span></span>
      <form action={sairAction}><button className="btn btn-sm text-[#f1dcd5] hover:bg-white/10" title="Sair">Sair</button></form>
    </div>
  );
  void podeImportar;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[var(--sidebar)_1fr]">
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <aside className="side sticky top-0 hidden h-screen flex-col gap-4 overflow-y-auto px-3.5 py-5 lg:flex">
        <div className="px-1.5">{brand}</div>
        <div className="flex-1"><NavLinks groups={groups} /></div>
        {me}
      </aside>
      <details className="mnav side sticky top-0 z-30 lg:hidden">
        <summary className="flex items-center justify-between px-4 py-3">{brand}<span className="rounded-[8px] border border-white/25 px-3 py-1.5 text-sm font-semibold text-white">Menu</span></summary>
        <div className="space-y-4 px-4 pb-5"><NavLinks groups={groups} />{me}</div>
      </details>
      <main id="conteudo" className="min-w-0 px-4 py-6 md:px-8 md:py-8"><div className="mx-auto max-w-[1480px]">{children}</div></main>
    </div>
  );
}
