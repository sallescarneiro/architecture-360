import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { projetosParaAssociacao } from "@/lib/agenda/sync";
import { hojeLocal } from "@/lib/agenda/datas";
import { STATUS_REUNIAO, fmtPeriodo, lerFiltros, listarReunioes } from "@/lib/reunioes";
import { ORIGENS, listarMotivos } from "@/lib/reunioes-motivos";
import { Badge, Button, Card, Empty, Input, LinkButton, PageHeader } from "@/components/ui";

/** Reuniões (T-188): lista com filtros; arquiteta vê só as suas (criou, participa ou é do seu projeto); gestão vê todas. */
export default async function ReunioesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const f = lerFiltros(sp);
  const [lista, projetos, motivos] = await Promise.all([listarReunioes(u, f), projetosParaAssociacao(), listarMotivos()]);
  const hoje = hojeLocal();
  const qs = new URLSearchParams(Object.entries({ projeto: f.projeto ? String(f.projeto) : "", motivo: f.motivo, origem: f.origem, status: f.status, de: f.de ?? "", ate: f.ate ?? "", q: f.q }).filter(([, v]) => v)).toString();
  const atual = `/reunioes${qs ? `?${qs}` : ""}`;
  const futuras = lista.filter((r) => r.status === "planejada" && r.fim.getTime() >= Date.now()), passadas = lista.filter((r) => !futuras.includes(r));
  const abertos = lista.reduce((a, r) => a + r.encaminhamentosAbertos, 0);
  const restrita = u.perfil === "arquiteta";

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Inteligência de Reuniões" title="Reuniões"
        subtitle={<>Reuniões técnicas dos projetos de arquitetura: toda reunião pertence a um projeto e o cliente vem do projeto. A gravação fica na plataforma de origem; o A360 guarda só o link e o texto da transcrição. {restrita ? "Você vê as reuniões que registrou, de que participa ou dos seus projetos." : "Coordenação e gestão veem todas."} Nada aqui altera o Vobi.</>}
        actions={<div className="flex flex-wrap gap-2"><LinkButton href={`/reunioes/nova?volta=${encodeURIComponent(atual)}`} variant="primary">+ Nova reunião</LinkButton><LinkButton href="/reunioes/clientes">Histórico por cliente</LinkButton><LinkButton href="/agenda">Agenda</LinkButton></div>} />

      <form className="card flex flex-wrap items-end gap-3 p-3" method="get">
        <label className="block min-w-[12rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Buscar<Input name="q" defaultValue={f.q} placeholder="título, projeto ou cliente" className="mt-1" /></label>
        <label className="block min-w-[14rem] text-xs font-semibold text-[var(--txt-2)]">Projeto<select name="projeto" className="input mt-1" defaultValue={f.projeto ?? ""}><option value="">todos</option>{projetos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}</select></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Motivo<select name="motivo" className="input mt-1" defaultValue={f.motivo}><option value="">todos os motivos</option>{motivos.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.ativo ? "" : " (desativado)"}</option>)}<option value="nc">Não classificada (antigas)</option></select></label>
        <label className="block text-xs font-semibold text-[var(--txt-2)]">Origem<select name="origem" className="input mt-1" defaultValue={f.origem}><option value="">todas as origens</option>{Object.entries(ORIGENS).map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="nc">Não informada (antigas)</option></select></label>
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
      <thead><tr><th>Quando</th><th>Reunião</th><th>Motivo · origem</th><th>Projeto · cliente</th><th>Gravação</th><th>Transcrição</th><th>Status</th><th>Decisões</th><th>Encaminh. abertos</th></tr></thead>
      <tbody>{lista.map((r) => { const st = STATUS_REUNIAO[r.status]; return (
        <tr key={r.id}>
          <td className="whitespace-nowrap">{fmtPeriodo(r.inicio, r.fim)}</td>
          <td><Link className="ent" href={`/reunioes/${r.id}?volta=${encodeURIComponent(atual)}`}>{r.titulo}</Link>{r.local && <span className="sub">{r.local}</span>}</td>
          <td>{r.motivoNome ? <Badge tone="info">{r.motivoNome.replace(/^Reunião de /, "")}</Badge> : <Badge tone="warn">Não classificada</Badge>}<span className="sub">{r.origem ? `Origem: ${ORIGENS[r.origem]}` : "origem não informada"}</span></td>
          <td>{r.projetoNome ? <Link className="underline" href={`/projetos/${r.projetoCodigo}`}>{r.projetoNome}</Link> : <span className="text-[var(--muted)]">—</span>}{r.clienteNome && <span className="sub">{r.clienteNome}</span>}</td>
          <td>{r.gravacaoUrl ? <Badge tone="ok">Link{r.gravacaoDuracaoMin ? ` · ${r.gravacaoDuracaoMin} min` : ""}</Badge> : <Badge>Sem gravação</Badge>}</td>
          <td>{r.transcricaoKb != null ? <Badge tone="ok">{r.transcricaoAntiga ? "Arquivo antigo" : `Texto · ${Math.max(1, r.transcricaoKb)} KB`}</Badge> : <Badge>Sem transcrição</Badge>}</td>
          <td><Badge tone={st?.tom ?? "neutral"}>{st?.rotulo ?? r.status}</Badge></td>
          <td>{r.decisoes || <span className="text-[var(--muted)]">0</span>}</td>
          <td>{r.encaminhamentosAbertos ? <b>{r.encaminhamentosAbertos}</b> : <span className="text-[var(--muted)]">0</span>}</td>
        </tr>); })}</tbody>
    </table></div>
  );
}
