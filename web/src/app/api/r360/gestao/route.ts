import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { operacaoPara360 } from "@/lib/servicos/r360-operacao";

export const dynamic = "force-dynamic";

/**
 * Leitura para a Gestão diária do Rucelle 360° (T-260, autorizada por Rodrigo em 19/11/2026). SOMENTE LEITURA.
 * O que pede a direção hoje: entregáveis em revisão interna (aguardando aprovação) e alertas abertos
 * de prioridade crítica ou alta. Sem dados por pessoa além do título do item.
 * Com ?perfil=gerencia (perfil Gerência de Arquitetura do 360°, T-309): só entregáveis na etapa da gerência
 * (sênior → coordenação → gerência) e, como acompanhar, os projetos com tarefa vencida.
 * Chave própria do 360° no cabeçalho x-r360-key (variável R360_READ_KEY). Sem a variável, a rota fica desligada.
 */
const iguais = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const base = () => (process.env.APP_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/$/, "");
const dm = (d: Date | string) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

export async function GET(req: Request) {
  const chave = process.env.R360_READ_KEY;
  if (!chave || chave.length < 16) return NextResponse.json({ erro: "leitura do 360° desligada" }, { status: 503 });
  if (!iguais(req.headers.get("x-r360-key") ?? "", chave)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const gerencia = new URL(req.url).searchParams.get("perfil") === "gerencia";
  const ent = await db.execute(sql`
    select e.id, e.titulo, e.versao_atual, e.atualizado_em, p.nome as projeto
    from entregavel e left join projeto p on p.codigo = e.projeto_codigo
    where e.status = 'revisao_interna' ${gerencia ? sql`and e.etapa_revisao = 'gerencia'` : sql``} order by e.atualizado_em asc limit 30`);
  const al = await db.execute(sql`
    select a.id, a.titulo, a.prioridade, a.situacao, a.prazo, a.criado_em, p.nome as projeto
    from projeto_alerta a left join projeto p on p.codigo = a.projeto_codigo
    where a.situacao in ('aberto','em_analise','esclarecimento','em_tratamento') and a.prioridade in ('critico','alto')
    order by case a.prioridade when 'critico' then 0 else 1 end, a.criado_em asc limit 30`);

  const url = base();
  const itens = [
    ...ent.rows.map((r) => ({
      id: `ent-${r.id}`, titulo: `Aprovar entregável: ${String(r.titulo)}`.slice(0, 200),
      contexto: [r.projeto ? String(r.projeto) : null, `versão ${r.versao_atual}`, gerencia ? `na etapa da gerência desde ${dm(r.atualizado_em as string)}` : `em revisão interna desde ${dm(r.atualizado_em as string)}`].filter(Boolean).join(" · "),
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
  if (gerencia) {
    const op = await operacaoPara360().catch(() => null);
    for (const x of op?.complemento?.problemas?.projetosComTarefaVencida?.slice(0, 10) ?? []) itens.push({
      id: `venc-${x.codigo}`, titulo: `Acompanhar ${x.projeto}: ${x.tarefasVencidas} tarefa${x.tarefasVencidas === 1 ? "" : "s"} vencida${x.tarefasVencidas === 1 ? "" : "s"}`.slice(0, 200),
      contexto: "tarefas abertas com prazo vencido na última carga do Vobi", link: x.link, prazo: null, grupo: "quando_der",
      natureza: "acompanhar", motivo: "Projeto com tarefa vencida: conferir com a coordenação.",
    } as (typeof itens)[number]);
  }
  return NextResponse.json({ geradoEm: new Date().toISOString(), itens }, { headers: { "cache-control": "no-store" } });
}
