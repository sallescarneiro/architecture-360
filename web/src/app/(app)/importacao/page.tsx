import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { IDADE_MAXIMA_CARGA_DIAS } from "@/lib/importador/normalizacao";
import { UploadForm } from "./UploadForm";
import { Badge, Card, PageHeader } from "@/components/ui";

const rotuloStatus: Record<string, string> = {
  previa: "Prévia (aguardando confirmação)", aceita: "Aceita", retida: "Retida", recusada: "Recusada",
  ignorada: "Ignorada", descartada: "Descartada", erro: "Erro",
};
const tomStatus: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = { aceita: "ok", previa: "info", retida: "warn", recusada: "bad", erro: "bad" };

export default async function ImportacaoPage() {
  const u = await exigirUsuario();
  const cargas = await db.select({
    id: schema.cargas.id, status: schema.cargas.status, motivo: schema.cargas.motivo, dataCarga: schema.cargas.dataCarga,
    criadoEm: schema.cargas.criadoEm, linhasProjetos: schema.cargas.linhasProjetos, linhasTarefas: schema.cargas.linhasTarefas, linhasClientes: schema.cargas.linhasClientes, tipo: schema.cargas.tipo,
    relatorio: schema.cargas.relatorio, enviadoPor: schema.usuarios.nome,
  }).from(schema.cargas).leftJoin(schema.usuarios, eq(schema.cargas.enviadoPorId, schema.usuarios.id))
    .orderBy(desc(schema.cargas.id)).limit(50);
  const ultimaAceita = cargas.find((c) => c.status === "aceita" && c.tipo === "operacao");
  const ultimaClientes = cargas.find((c) => c.status === "aceita" && c.linhasClientes != null);
  const idade = ultimaAceita ? Math.floor((Date.now() - new Date(ultimaAceita.dataCarga + "T00:00:00").getTime()) / 86400_000) : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Dados" title="Importação Vobi"
        subtitle={<>Exportações oficiais do Vobi, somente leitura; nada é alterado na fonte. Última carga aceita: {ultimaAceita ? `${ultimaAceita.dataCarga} (carga ${ultimaAceita.id})` : "nenhuma"}. Clientes: {ultimaClientes ? `${ultimaClientes.dataCarga} (carga ${ultimaClientes.id})` : "ainda não importados"}.
          {idade != null && idade > IDADE_MAXIMA_CARGA_DIAS && <> <Badge tone="warn">{idade} dias sem carga</Badge></>}</>} />
      {podeImportar(u.perfil) ? <UploadForm hoje={new Date().toISOString().slice(0, 10)} /> :
        <Card><p className="text-sm text-[var(--muted)]">Somente os perfis admin e gestão podem importar.</p></Card>}
      <Card title="Histórico de cargas">
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>#</th><th>Exportação</th><th>Enviada</th><th>Por</th><th>Status</th><th>Projetos</th><th>Tarefas</th><th>Clientes</th><th>Novos / alterados / não encontrados</th></tr></thead>
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
                  <td>{c.dataCarga}</td>
                  <td>{c.criadoEm.toLocaleString("pt-BR")}</td>
                  <td>{c.enviadoPor ?? "—"}</td>
                  <td><Badge tone={tomStatus[c.status] ?? "neutral"}>{rotuloStatus[c.status] ?? c.status}</Badge>{c.motivo && <div className="text-xs text-[var(--muted)] max-w-xs truncate" title={c.motivo}>{c.motivo}</div>}</td>
                  <td>{c.linhasProjetos ?? "—"}</td>
                  <td>{c.linhasTarefas ?? "—"}</td>
                  <td>{c.linhasClientes ?? "—"}</td>
                  <td className="text-xs">{resumo || "—"}</td>
                </tr>
              );
            })}
            {!cargas.length && <tr><td colSpan={9} className="text-[var(--muted)]">Nenhuma carga ainda.</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}
