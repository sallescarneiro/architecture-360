import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

/** Componentes base do sistema de design rucelle. Tokens e classes utilitárias em globals.css. */

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({ variant = "primary", className = "", ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`btn btn-${variant} ${className}`} {...p} />;
}

export function LinkButton({ href, children, variant = "secondary", className = "" }: { href: string; children: ReactNode; variant?: Variant; className?: string }) {
  return <Link href={href} className={`btn btn-${variant} ${className}`}>{children}</Link>;
}

export function Input(p: ComponentProps<"input">) {
  return <input {...p} className={`input ${p.className ?? ""}`} />;
}
export function Textarea(p: ComponentProps<"textarea">) {
  return <textarea {...p} className={`input ${p.className ?? ""}`} />;
}
export function Select(p: ComponentProps<"select">) {
  return <select {...p} className={`input ${p.className ?? ""}`} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[0.78rem] font-semibold text-[var(--txt-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info" | "warn"; children: ReactNode }) {
  const c = {
    error: "bg-[var(--bad-bg)] text-[#9a3a24] border-[#f3c9bd]",
    success: "bg-[var(--ok-bg)] text-[#2f5f47] border-[#cfe4d8]",
    warn: "bg-[var(--warn-bg)] text-[#7d5416] border-[#f0dcb5]",
    info: "bg-[var(--rose-2)] text-[var(--vinho)] border-[var(--rose)]",
  }[kind];
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-[10px] border px-3.5 py-2.5 text-sm leading-relaxed ${c}`}>{children}</div>;
}

/** Pílula de estado. `tone` usa as cores funcionais; `color` permite cor livre (categorias). */
export function Badge({ children, tone, color }: { children: ReactNode; tone?: "ok" | "warn" | "bad" | "info" | "neutral"; color?: string }) {
  const style: CSSProperties | undefined = color ? { background: color + "1a", color } : tone ? { background: `var(--${tone}-bg)`, color: `var(--${tone})` } : { background: "var(--neutral-bg)", color: "var(--txt-2)" };
  return <span className="pill" style={style}>{children}</span>;
}

export function Card({ children, className = "", title, subtitle, actions, id }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section id={id} className={`card p-4 md:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[1rem] font-semibold leading-tight tracking-[-0.01em]">{title}</h2>}
            {subtitle && <p className="mt-1 text-[0.78rem] leading-snug text-[var(--muted)]">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Cabeçalho de página: rótulo da seção (eyebrow), título editorial, apoio e ações. */
export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="display text-[1.95rem] leading-[1.1] text-[var(--grafite)] md:text-[2.2rem]">{title}</h1>
        {subtitle && <p className="mt-2 text-[0.9rem] leading-relaxed text-[var(--txt-2)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Indicador clicável (abre os registros que ele conta). Sem `href`, é só leitura. */
export function Stat({ label, value, note, tone, pill, href, source }: { label: string; value: ReactNode; note?: ReactNode; tone?: "ok" | "warn" | "bad" | "info" | "neutral"; pill?: ReactNode; href?: string; source?: "meta" | "calc" }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-[0.78rem] font-semibold text-[var(--txt-2)]">
        <span className="flex items-center gap-1.5">{label}{source && <SourceTag source={source} />}</span>
        {href && <span aria-hidden className="text-[var(--muted)]">→</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1"><span className="kpi-val">{value}</span>{pill && <span className="pill" style={{ background: `var(--${tone ?? "neutral"}-bg)`, color: `var(--${tone ?? "neutral"})` }}>{pill}</span>}</div>
      {note && <div className="mt-1.5 text-[0.75rem] leading-snug text-[var(--muted)]">{note}</div>}
    </>
  );
  return href ? <Link href={href} className="card card-link block p-4 md:p-5">{body}</Link> : <div className="card p-4 md:p-5">{body}</div>;
}

/** Origem do número: "Meta" (veio da Meta) ou "calculado" (conta feita pela Central). */
export function SourceTag({ source }: { source: "meta" | "calc" }) {
  return source === "meta"
    ? <span className="tag text-[#2c4a7a]" title="Número informado pela Meta">Meta</span>
    : <span className="tag text-[var(--muted)]" title="Calculado pela Central a partir dos números da Meta">calculado</span>;
}

/** Filtro ativo removível: o "×" é um link para a mesma página sem esse filtro. */
export function Chip({ label, value, removeHref }: { label: string; value: ReactNode; removeHref: string }) {
  return <span className="chip">{label}: <b>{value}</b><Link href={removeHref} aria-label={`Remover filtro ${label}`} title="Remover filtro">×</Link></span>;
}

/** Alternador de visualização feito de links (funciona sem JavaScript). */
export function Segmented({ items, label }: { items: { href: string; label: ReactNode; on: boolean }[]; label: string }) {
  return <nav aria-label={label} className="seg">{items.map((i) => <Link key={i.href} href={i.href} aria-current={i.on ? "page" : undefined}>{i.label}</Link>)}</nav>;
}

/** Estado vazio padronizado. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--surface-2)] px-4 py-8 text-center text-sm text-[var(--muted)]">
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Avatar com iniciais, na cor da marca. */
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const ini = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("");
  return <span className="inline-grid shrink-0 place-items-center rounded-full bg-[var(--vinho)] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>{ini || "?"}</span>;
}

/** Barra de progresso horizontal (0–100). */
export function Bar({ value, color = "var(--vinho)", className = "" }: { value: number; color?: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return <span className={`bar block ${className}`}><span style={{ width: `${v}%`, background: color }} /></span>;
}
