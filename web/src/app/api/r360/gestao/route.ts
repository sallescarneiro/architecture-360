import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Leitura para a Gestão diária do Rucelle 360° (T-260, autorizada por Rodrigo em 19/11/2026). SOMENTE LEITURA.
 * O que pede a direção hoje: entregáveis em revisão interna (aguardando aprovação) e alertas abertos
 * de prioridade crítica ou alta. Sem dados por pessoa além do título do item.
 * Chave própria do 360° no cabeçalho x-r360-key (variável R360_READ_KEY). Sem a variável, a rota fica desligada.
 */
const iguais = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const base = () => (process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/$/, "");
const dm = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

export async function GET(req: Request) {
  const chave = process.env.R360_READ_KEY;
  if (!chave || chave.length < 16) return NextResponse.json({ erro: "leitura do 360° desligada" }, { status: 503 });
  if (!iguais(req.headers.get("x-r360-key") ?? "", chave)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const ent = await db.execute(sql`
    select e.id, e.titulo, e.versao_atual, e.atualizado_em, p.nome as projeto
    from entregavel e left join projeto p on p.codigo = e.projeto_codigo
    where e.status = 'revisao_interna' order by e.atualizado_em asc limit 30`);
  const al = await db.execute(sql`
    select a.id, a.titulo, a.prioridade, a.situacao, a.prazo, a.criado_em, p.nome as projeto
    from projeto_alerta a left join projeto p on p.codigo = a.projeto_codigo
    where a.situacao in ('aberto','em_analise','esclarecimento','em_tratamento') and a.prioridade in ('critico','alto')
    order by case a.prioridade when 'critico' then 0 else 1 end, a.criado_em asc limit 30`);

  const url = base();
  const itens = [
    ...ent.rows.map((r) => ({
      id: `ent-${r.id}`, titulo: `Aprovar entregável: ${String(r.titulo)}`.slice(0, 200),
      contexto: [r.projeto ? String(r.projeto) : null, `versão ${r.versao_atual}`, `em revisão interna desde ${dm(r.atualizado_em as string)}`].filter(Boolean).join(" · "),
      link: url ? `${url}/entregaveis/${r.id}` : null, prazo: null, grupo: "hoje",
    })),
    ...al.rows.map((r) => {
      const prazo = r.prazo ? String(r.prazo).slice(0, 10) : null;
      return {
        id: `alerta-${r.id}`, titulo: `Alerta ${r.prioridade === "critico" ? "crítico" : "alto"}: ${String(r.titulo)}`.slice(0, 200),
        contexto: [r.projeto ? String(r.projeto) : null, `situação: ${String(r.situacao).replace("_", " ")}`, `aberto desde ${dm(r.criado_em as string)}`].filter(Boolean).join(" · "),
        link: url ? `${url}/alertas/${r.id}` : null, prazo, grupo: r.prioridade === "critico" ? "hoje" : "quando_der",
      };
    }),
  ];
  return NextResponse.json({ geradoEm: new Date().toISOString(), itens }, { headers: { "cache-control": "no-store" } });
}
