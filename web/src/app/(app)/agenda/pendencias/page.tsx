import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario } from "@/lib/auth";
import { ESTADO_VOBI, pendencias, podeGerirAgenda } from "@/lib/agenda/atividades";
import { dataHora } from "@/lib/agenda/datas";
import { NOME_CAMPO, type Campo } from "@/lib/vobi/reconciliar";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/ui";

/** T-219 — Conflitos e divergências com o Vobi + fila de envio (Fase 0: tudo aguardando; nada é enviado). Só gestão. */
export default async function PendenciasPage() {
  const u = await exigirUsuario();
  if (!podeGerirAgenda(u.perfil)) redirect("/sem-permissao");
  const pend = await pendencias();
  const fila = await db.select({ e: schema.vobiEnvios, titulo: schema.atividades.titulo }).from(schema.vobiEnvios)
    .innerJoin(schema.atividades, eq(schema.atividades.id, schema.vobiEnvios.atividadeId))
    .where(inArray(schema.vobiEnvios.estado, ["aguardando", "erro", "conflito"])).orderBy(desc(schema.vobiEnvios.id)).limit(200);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Pendências com o Vobi" subtitle="Conflitos esperam decisão da gestão; divergências são tarefas que o Vobi diz não existir. Escrita no Vobi desligada (Fase 0)." actions={<LinkButton href="/agenda">← Agenda</LinkButton>} />
      <Card title={`Conflitos e divergências (${pend.length})`}>
        {pend.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Atividade</th><th>Situação</th><th>Campos</th><th>Atualizada</th></tr></thead><tbody>
          {pend.map((a) => <tr key={a.id}><td><Link className="underline" href={`/agenda/atividade/${a.id}`}>{a.titulo}</Link></td><td><Badge tone={ESTADO_VOBI[a.estadoVobi]?.tom}>{ESTADO_VOBI[a.estadoVobi]?.rotulo}</Badge></td>
            <td>{Object.keys(a.conflitos ?? {}).map((c) => NOME_CAMPO[c as Campo] ?? c).join(", ") || (a.tarefaVobiId ? `tarefa nº ${a.tarefaVobiId}` : "—")}</td><td>{dataHora(a.atualizadoEm)}</td></tr>)}
        </tbody></table></div> : <Empty>Nenhum conflito ou divergência.</Empty>}
      </Card>
      <Card title={`Aguardando envio ao Vobi (${fila.length})`} subtitle="Pedidos registrados pela programação; serão enviados só nas fases autorizadas.">
        {fila.length ? <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>#</th><th>Atividade</th><th>Operação</th><th>Campos</th><th>Estado</th><th>Criado</th></tr></thead><tbody>
          {fila.map(({ e, titulo }) => <tr key={e.id}><td>{e.id}</td><td><Link className="underline" href={`/agenda/atividade/${e.atividadeId}`}>{titulo}</Link></td><td>{e.operacao}</td>
            <td>{Object.keys(e.campos).map((c) => NOME_CAMPO[c as Campo] ?? c).join(", ")}</td><td>{e.estado}</td><td>{dataHora(e.criadoEm)}</td></tr>)}
        </tbody></table></div> : <Empty>Nada aguardando.</Empty>}
      </Card>
    </div>
  );
}
