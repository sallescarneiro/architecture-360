"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type IconName = "home" | "tasks" | "bell" | "ads" | "insta" | "users" | "tag" | "upload" | "mail" | "plug" | "shield" | "plus" | "bolt" | "check" | "calendar";
export type NavItem = { href: string; label: string; icon: IconName; count?: number };
export type NavGroup = { label: string; items: NavItem[] };

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  tasks: "M4 5h16M4 12h16M4 19h10M17 17l2 2 3-4",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0",
  ads: "M4 19V9M10 19V5M16 19v-7M22 19H2",
  insta: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17.5 6.5h.01",
  users: "M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  tag: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01",
  upload: "M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  plus: "M12 5v14M5 12h14",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  calendar: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
};

/** Ícone de traço simples (decorativo: o texto ao lado é o rótulo). */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  );
}

function isOn(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(href + "/");
}

/** Navegação principal agrupada; destaca a seção ativa pela rota. */
export function NavLinks({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  // vale o item mais específico: em /reunioes/clientes acende "Histórico por cliente", não também "Reuniões"
  const todos = groups.flatMap((g) => g.items.map((i) => i.href)).filter((h) => isOn(path, h));
  const ativo = todos.sort((a, b) => b.length - a.length)[0];
  return (
    <nav aria-label="Navegação principal" className="space-y-0.5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="group">{g.label}</div>
          {g.items.map((n) => (
            <Link key={n.href} href={n.href} className="nav" aria-current={n.href === ativo ? "page" : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
              {!!n.count && <span className="count" aria-label={`${n.count} não lidas`}>{n.count}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
