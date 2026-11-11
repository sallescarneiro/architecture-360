import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { IDADE_MAXIMA_CARGA_DIAS } from "@/lib/importador/normalizacao";
import { UploadForm } from "./UploadForm";
import { sincronizarAgoraAction } from "./actions";
import { apiConfigurada } from "@/lib/vobi/api";
import type { Relatorio } from "@/lib/importador/importador";
import { Alert, Badge, Button, Card, PageHeader } from "@/components/ui";

const rotuloStatus: Record<string, string> = {
  previa: "Prévia (aguardando confirmação)", aceita: "Aceita", retida: "Retida", recusada: "Recusada",
  ignorada: "Ignorada", descartada: "Descartada", erro: "Erro", sincronizando: "Sincronizando…",
};
const tomStatus: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { aceita: "ok", previa: "info", retida: "warn", recusada: "bad", erro: "bad" };

export default async function ImportacaoPage({ searchParams }: { searchParams: Promise<{ sinc?: string }> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const cargas = await db.select({
    id: schema.cargas.id, status: schema.cargas.status, motivo: schema.cargas.motivo, dataCarga: schema.cargas.dataCarga,
    criadoEm: schema.cargas.criadoEm, linhasProjetos: schema.cargas.linhasProjetos, linhasTarefas: schema.cargas.linhasTarefas, linhasClientes: schema.cargas.linhasClientes, tipo: schema.cargas.tipo,
    relatorio: schema.cargas.relatorio, origem: schema.cargas.origem, enviadoPor: schema.usuarios.nome,
  }).from(schema.cargas).leftJoin(schema.usuarios, eq(schema.cargas.enviadoPorId, schema.usuarios.id))
    .orderBy(desc(schema.cargas.id)).limit(50);
  const ultimaAceita = cargas.find((c) => c.status === "aceita" && c.tipo === "operacao");
  const ultimaClientes = cargas.find((c) => c.status === "aceita" && c.linhasClientes != null);
  // T-218: sincronização pela API — "em dia" também quando o Vobi não mudou (carga ignorada por hash igual)
  const configurada = apiConfigurada();
  const ultimaSinc = cargas.find((c) => c.origem === "api");
  const ultimaSincOk = cargas.find((c) => c.origem === "api" && (c.status === "aceita" || c.status === "ignorada"));
  const diag = (ultimaSinc?.relatorio as Relatorio | null)?.api;
  const refIdade = [ultimaAceita?.dataCarga, ultimaSincOk?.dataCarga].filter(Boolean).sort().pop();
  const idade = refIdade ? Math.floor((Date.now() - new Date(refIdade + "T00:00:00").getTime()) / 86400_000) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Dados" title="Importação Vobi"
        subtitle={<>Exportações oficiais do Vobi, somente leitura; nada é alterado na fonte. Última carga aceita: {ultimaAceita ? `${ultimaAceita.dataCarga} (carga ${ultimaAceita.id})` : "nenhuma"}. Clientes: {ultimaClientes ? `${ultimaClientes.dataCarga} (carga ${ultimaClientes.id})` : "ainda não importados"}.
          {idade != null && idade > IDADE_MAXIMA_CARGA_DIAS && <> <Badge tone="warn">{idade} dias sem carga</Badge></>}</>} />
      <Card title={<>Sincronização automática com o Vobi <Badge tone={configurada ? "ok" : "neutral"}>{configurada ? "API ativa" : "aguardando configuração"}</Badge></>}
        subtitle={configurada ? "Todos os dias a partir das 06:00 (Brasília) o A360 lê o Vobi pela API, somente leitura, e atualiza projetos, tarefas e clientes pelas mesmas regras da importação. Entra sozinha quando não há anomalia; carga fora do padrão fica retida para conferência."
          : "A integração com a API do Vobi ainda não está configurada neste serviço. Enquanto isso, a importação continua pelos CSV abaixo."}>
        <div className="flex flex-col gap-3">
          {sp.sinc && <Alert kind="info">{sp.sinc === "em_andamento" ? "Já há uma sincronização em andamento." : sp.sinc === "nao_configurada" ? "A API do Vobi ainda não está configurada." : sp.sinc}</Alert>}
          {ultimaSinc ? (
            <p className="text-sm">Última sincronização: <Link className="font-semibold text-[var(--vinho)] underline" href={`/importacao/${ultimaSinc.id}`}>carga {ultimaSinc.id}</Link> em {ultimaSinc.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · <Badge tone={tomStatus[ultimaSinc.status] ?? "neutral"}>{rotuloStatus[ultimaSinc.status] ?? ultimaSinc.status}</Badge>
              {ultimaSinc.motivo && <span className="text-[var(--muted)]"> — {ultimaSinc.motivo}</span>}
              {diag && <> · {diag.projetos} projetos, {diag.tarefas} tarefas{diag.clientes ? `, ${diag.clientes} clientes` : ""}</>}</p>
          ) : configurada && <p className="text-sm text-[var(--muted)]">Nenhuma sincronização ainda. A primeira fica em prévia para conferência; as seguintes entram sozinhas.</p>}
          {diag && diag.responsaveis.semNome.length > 0 && <Alert kind="warn">{diag.responsaveis.semNome.length} responsável(is) do Vobi aparecem só por número. Indique quem é cada um em <Link className="underline" href="/pessoas">Pessoas</Link> (uma vez só).</Alert>}
          {configurada && podeImportar(u.perfil) && <form action={sincronizarAgoraAction}><Button variant="secondary">Sincronizar agora</Button></form>}
        </div>
      </Card>
      {podeImportar(u.perfil) ? <UploadForm hoje={new Date().toISOString().slice(0, 10)} /> :
        <Card><p className="text-sm text-[var(--muted)]">Somente os perfis admin e gestão podem importar.</p></Card>}
      <Card title="Histórico de cargas">
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>#</th><th>Origem</th><th>Exportação</th><th>Enviada</th><th>Por</th><th>Status</th><th>Projetos</th><th>Tarefas</th><th>Clientes</th><th>Novos / alterados / não encontrados</th></tr></thead>
          <tbody>
            {cargas.map((c) => {
              const r = c.relatorio as { projetos?: { novos: number; alterados: number; naoEncontrados: number }; tarefas?: { novas: number; alteradas: number; naoEncontradas: number }; clientes?: { novos: number; alterados: number; naoEncontrados: number } } | null;
              const resumo = [
                r?.tarefas ? `tarefas ${r.tarefas.novas} / ${r.tarefas.alteradas} / ${r.tarefas.naoEncontradas} · projetos ${r.projetos?.novos} / ${r.projetos?.alterados} / ${r.projetos?.naoEncontrados}` : null,
                r?.clientes ? `clientes ${r.clientes.novos} / ${r.clientes.alterados} / ${r.clientes.naoEncontrados}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <tr key={c.id}>
                  <td><Link className="font-semibold text-[var(--vinho)] underline" href={`/importacao/${c.id}`}>{c.id}</Link></td>
                  <td>{c.origem === "api" ? <Badge tone="info">API</Badge> : "CSV"}</td>
                  <td>{c.dataCarga}</td>
                  <td>{c.criadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td>{c.enviadoPor ?? "—"}</td>
                  <td><Badge tone={tomStatus[c.status] ?? "neutral"}>{rotuloStatus[c.status] ?? c.status}</Badge>{c.motivo && <div className="text-xs text-[var(--muted)] max-w-xs truncate" title={c.motivo}>{c.motivo}</div>}</td>
                  <td>{c.linhasProjetos ?? "—"}</td>
                  <td>{c.linhasTarefas ?? "—"}</td>
                  <td>{c.linhasClientes ?? "—"}</td>
                  <td className="text-xs">{resumo || "—"}</td>
                </tr>
              );
            })}
            {!cargas.length && <tr><td colSpan={10} className="text-[var(--muted)]">Nenhuma carga ainda.</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}
