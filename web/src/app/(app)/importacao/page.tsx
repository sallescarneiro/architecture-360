import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { IDADE_MAXIMA_CARGA_DIAS } from "@/lib/importador/normalizacao";
import { UploadForm } from "./UploadForm";

const rotuloStatus: Record<string, string> = {
  previa: "Prévia (aguardando confirmação)", aceita: "Aceita", retida: "Retida", recusada: "Recusada",
  ignorada: "Ignorada", descartada: "Descartada", erro: "Erro",
};
const classeStatus: Record<string, string> = { aceita: "badge-ok", previa: "badge", retida: "badge-warn", recusada: "badge-bad", erro: "badge-bad" };

export default async function ImportacaoPage() {
  const u = await exigirUsuario();
  const cargas = await db.select({
    id: schema.cargas.id, status: schema.cargas.status, motivo: schema.cargas.motivo, dataCarga: schema.cargas.dataCarga,
    criadoEm: schema.cargas.criadoEm, linhasProjetos: schema.cargas.linhasProjetos, linhasTarefas: schema.cargas.linhasTarefas,
    relatorio: schema.cargas.relatorio, enviadoPor: schema.usuarios.nome,
  }).from(schema.cargas).leftJoin(schema.usuarios, eq(schema.cargas.enviadoPorId, schema.usuarios.id))
    .orderBy(desc(schema.cargas.id)).limit(50);
  const ultimaAceita = cargas.find((c) => c.status === "aceita");
  const idade = ultimaAceita ? Math.floor((Date.now() - new Date(ultimaAceita.dataCarga + "T00:00:00").getTime()) / 86400_000) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Importação Vobi</h1>
        <p className="text-sm text-[var(--muted)]">Exportações oficiais do Vobi, somente leitura. Última carga aceita: {ultimaAceita ? `${ultimaAceita.dataCarga} (carga ${ultimaAceita.id})` : "nenhuma"}.
          {idade != null && idade > IDADE_MAXIMA_CARGA_DIAS && <span className="badge badge-warn ml-2">{idade} dias sem carga</span>}</p>
      </div>
      {podeImportar(u.perfil) ? <UploadForm hoje={new Date().toISOString().slice(0, 10)} /> :
        <div className="card text-sm text-[var(--muted)]">Somente os perfis admin e gestão podem importar.</div>}
      <div className="card">
        <div className="font-semibold mb-2">Histórico de cargas</div>
        <table className="w-full text-sm">
          <thead><tr><th>#</th><th>Exportação</th><th>Enviada</th><th>Por</th><th>Status</th><th>Projetos</th><th>Tarefas</th><th>Novos / alterados / não encontrados</th></tr></thead>
          <tbody>
            {cargas.map((c) => {
              const r = c.relatorio as { projetos?: { novos: number; alterados: number; naoEncontrados: number }; tarefas?: { novas: number; alteradas: number; naoEncontradas: number } } | null;
              return (
                <tr key={c.id}>
                  <td><Link className="underline" href={`/importacao/${c.id}`}>{c.id}</Link></td>
                  <td>{c.dataCarga}</td>
                  <td>{c.criadoEm.toLocaleString("pt-BR")}</td>
                  <td>{c.enviadoPor ?? "—"}</td>
                  <td><span className={`badge ${classeStatus[c.status] ?? ""}`}>{rotuloStatus[c.status] ?? c.status}</span>{c.motivo && <div className="text-xs text-[var(--muted)] max-w-xs truncate" title={c.motivo}>{c.motivo}</div>}</td>
                  <td>{c.linhasProjetos ?? "—"}</td>
                  <td>{c.linhasTarefas ?? "—"}</td>
                  <td className="text-xs">{r?.tarefas ? `tarefas ${r.tarefas.novas} / ${r.tarefas.alteradas} / ${r.tarefas.naoEncontradas} · projetos ${r.projetos?.novos} / ${r.projetos?.alterados} / ${r.projetos?.naoEncontrados}` : "—"}</td>
                </tr>
              );
            })}
            {!cargas.length && <tr><td colSpan={8} className="text-[var(--muted)]">Nenhuma carga ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
