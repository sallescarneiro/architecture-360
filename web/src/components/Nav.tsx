import Link from "next/link";
import type { Usuario } from "@/lib/auth";
import { sairAction } from "@/app/login/actions";

const itens = [
  { href: "/", rotulo: "Operação" },
  { href: "/qualidade", rotulo: "Qualidade dos dados" },
  { href: "/importacao", rotulo: "Importação Vobi" },
  { href: "/pessoas", rotulo: "Pessoas" },
];

export function Nav({ usuario }: { usuario: Usuario }) {
  return (
    <aside className="w-60 shrink-0 border-r border-[var(--line)] bg-white p-5 flex flex-col gap-6 min-h-screen">
      <div>
        <div className="text-lg font-bold tracking-tight">Architecture 360</div>
        <div className="text-xs text-[var(--muted)]">rucelle · camada de gestão sobre o Vobi</div>
      </div>
      <nav className="flex flex-col gap-1">
        {itens.map((i) => (
          <Link key={i.href} href={i.href} className="rounded-md px-3 py-2 text-sm hover:bg-[var(--bg)]">{i.rotulo}</Link>
        ))}
      </nav>
      <div className="mt-auto text-xs text-[var(--muted)]">
        <div className="font-medium text-[var(--fg)]">{usuario.nome}</div>
        <div>{usuario.email} · {usuario.perfil}</div>
        <form action={sairAction} className="mt-2"><button className="underline">Sair</button></form>
      </div>
    </aside>
  );
}
