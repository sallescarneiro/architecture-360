import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { projetosParaAssociacao } from "@/lib/agenda/sync";
import { hojeLocal } from "@/lib/agenda/datas";
import { STATUS_REUNIAO, fmtPeriodo, lerFiltros, listarReunioes } from "@/lib/reunioes";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader } from "@/components/ui";

/** Reuniões (T-188): lista com filtros; arquiteta vê só as suas (criou, participa ou é do seu projeto); gestão vê todas. */
export default async function ReunioesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const f = lerFiltros(sp);
  const [lista, projetos] = await Promise.all([listarReunioes(u, f), projetosParaAssociacao()]);
  const hoje = hojeLocal();
  const qs = new URLSearchParams(Object.entries({ projeto: f.projeto ? String(f.projeto) : "", status: f.status, de: f.de ?? "", ate: f.ate ?? "", q: f.q }).filter(([, v]) => v)).toString();
  const atual = `/reunioes${qs ? `?${qs}` : ""}`;
  const futuras = lista.filter((r) => r.status === "planejada" && r.fim.getTime() >= Date.now()), passadas = lista.filter((r) => !futuras.includes(r));
  const abertos = lista.reduce((a, r) => a + r.encaminhamentosAbertos, 0);
  const restrita = u.perfil === "arquiteta";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Reuniões" title="Reuniões"
        subtitle={<>Pauta, ata, decisões, aprovações e encaminhamentos ligados aos projetos do Vobi. {restrita ? "Você vê as reuniões que registrou, de que participa ou dos seus projetos." : "Coordenação e gestão veem todas."} Nada aqui altera o Vobi.</>}
        actions={<div className="flex gap-2"><LinkButton href={`/reunioes/nova?volta=${encodeURIComponent(atual)}`} variant="primary">+ Nova reunião</LinkButton><LinkButton href="/agenda">Agenda</LinkButton></div>} />

      <form className="card flex flex-wrap items-end gap-3 p-3" method="get">
        <label className="block min-w-[12rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Buscar<Input name="q" defaultValue={f.q} placeholder="título, projeto ou cliente" className="mt-1" /></label>
        <label className="block min-w-[14rem] text-xs font-semibold text-[var(--txt-2)]">Projeto<select name="projeto" className="input mt-1" defaultValue={f.projeto ?? ""}><option value="">todos</option>{projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Status<select name="status" className="input mt-1" defaultValue={f.status}><option value="">todos</option>{Object.entries(STATUS_REUNIAO).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">De<input type="date" name="de" defaultValue={f.de ?? ""} className="input mt-1" /></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Até<input type="date" name="ate" defaultValue={f.ate ?? ""} className="input mt-1" /></label>
        <Button variant="secondary" className="btn-sm">Filtrar</Button>
        {qs && <Link className="text-xs underline" href="/reunioes">limpar</Link>}
      </form>

      {!lista.length ? (
        <Empty action={<LinkButton href={`/reunioes/nova?volta=${encodeURIComponent(atual)}`} variant="primary">Registrar a primeira reunião</LinkButton>}>Nenhuma reunião {qs ? "com esses filtros" : "registrada ainda"}. Você também pode registrar uma reunião a partir de um compromisso da Agenda.</Empty>
      ) : (
        <>
          {futuras.length > 0 && <Card title={`Próximas (${futuras.length})`}><Tabela lista={futuras} atual={atual} hoje={hoje} /></Card>}
          <Card title={`Realizadas e anteriores (${passadas.length})`} subtitle={abertos ? `${abertos} encaminhamento(s) em aberto no total` : undefined}>
            {passadas.length ? <Tabela lista={passadas} atual={atual} hoje={hoje} /> : <p className="text-sm text-[var(--muted)]">Nenhuma.</p>}
          </Card>
        </>
      )}
      <p className="text-[0.74rem] text-[var(--muted)]">Reuniões, atas e encaminhamentos vivem no A360 com histórico imutável. Projetos e clientes vêm do Vobi (somente leitura); compromissos, da Google Agenda de cada pessoa.</p>
    </div>
  );
}

function Tabela({ lista, atual, hoje }: { lista: Awaited<ReturnType<typeof listarReunioes>>; atual: string; hoje: string }) {
  void hoje;
  return (
    <div className="overflow-x-auto"><table className="tbl">
      <thead><tr><th>Quando</th><th>Reunião</th><th>Projeto · cliente</th><th>Status</th><th>Decisões</th><th>Encaminh. abertos</th></tr></thead>
      <tbody>{lista.map((r) => { const st = STATUS_REUNIAO[r.status]; return (
        <tr key={r.id}>
          <td className="whitespace-nowrap">{fmtPeriodo(r.inicio, r.fim)}</td>
          <td><Link className="ent" href={`/reunioes/${r.id}?volta=${encodeURIComponent(atual)}`}>{r.titulo}</Link>{r.local && <span className="sub">{r.local}</span>}</td>
          <td>{r.projetoNome ? <Link className="underline" href={`/projetos/${r.projetoCodigo}`}>{r.projetoNome}</Link> : <span className="text-[var(--muted)]">—</span>}{r.clienteNome && <span className="sub">{r.clienteNome}</span>}</td>
          <td><Badge tone={st?.tom ?? "neutral"}>{st?.rotulo ?? r.status}</Badge></td>
          <td>{r.decisoes || <span className="text-[var(--muted)]">0</span>}</td>
          <td>{r.encaminhamentosAbertos ? <b>{r.encaminhamentosAbertos}</b> : <span className="text-[var(--muted)]">0</span>}</td>
        </tr>); })}</tbody>
    </table></div>
  );
}
