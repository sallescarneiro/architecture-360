import Link from "next/link";
import { exigirUsuario, veIndicadoresIndividuais } from "@/lib/auth";
import { contagem, linkVobiProjeto, ultimaCargaAceita } from "@/lib/consultas";

const rotulo: Record<string, string> = {
  completa: "Completas", incompleta_sem_responsavel: "Sem responsável", incompleta_sem_prazo: "Sem prazo",
  incompleta_sem_inicio: "Sem data de início", orfa: "Órfãs (projeto não resolvido)", encerrada: "Canceladas",
};
const entraEm: Record<string, string> = {
  completa: "todos os indicadores", incompleta_sem_responsavel: "indicadores por projeto/etapa; fora dos indicadores por pessoa",
  incompleta_sem_prazo: "contagens por status; fora de atraso, prazo e agenda", incompleta_sem_inicio: "prazo e atraso; fora de duração e agenda",
  orfa: "nenhum indicador", encerrada: "histórico",
};

export default async function QualidadePage({ searchParams }: { searchParams: Promise<{ classe?: string; pessoa?: string }> }) {
  const u = await exigirUsuario();
  const carga = await ultimaCargaAceita();
  if (!carga) return <div><h1 className="text-2xl font-bold">Qualidade dos dados</h1><p className="text-sm text-[var(--muted)]">Nenhuma carga aceita ainda. <Link className="underline" href="/importacao">Importar</Link>.</p></div>;
  const sp = await searchParams;
  const cid = carga.id;
  const porClasse = await contagem(`select classe_qualidade k, count(*)::int n from tarefa where ultima_carga=${cid} group by 1 order by 2 desc`);
  const alertas = await contagem(`select tipo k, count(*)::int n from alerta where carga_id=${cid} group by 1 order by 2 desc`);
  const etapas = await contagem(`select etapa_csv k, count(*)::int n from tarefa where ultima_carga=${cid} and etapa_conhecida=false group by 1 order by 2 desc`);
  const pessoas = await contagem(`select nome_vobi k from pessoa_vobi where origem='nao_mapeada' order by 1`);
  const piores = await contagem(`select p.codigo, p.nome, count(*)::int n from tarefa t join projeto p on p.codigo=t.projeto_codigo where t.ultima_carga=${cid} and t.classe_qualidade like 'incompleta%' group by 1,2 order by 3 desc limit 15`);
  const porPessoa = veIndicadoresIndividuais(u.perfil) ? await contagem(`select coalesce(responsavel_nome,'(sem responsável)') k, responsavel_email e,
     count(*)::int total, sum(case when classe_qualidade='completa' then 1 else 0 end)::int completas,
     sum(case when sem_fim then 1 else 0 end)::int sem_prazo, sum(case when sem_inicio then 1 else 0 end)::int sem_inicio
     from tarefa where ultima_carga=${cid} and orfa=false and status not in ('concluido','cancelado') group by 1,2 order by 3 desc`) : [];
  const colisoes = await contagem(`select t.chave, t.nome, t.etapa_canonica, p.nome projeto, p.codigo from tarefa t left join projeto p on p.codigo=t.projeto_codigo where t.ultima_carga=${cid} and t.colisao=true order by 1`);
  const orfas = await contagem(`select chave, nome, projeto_nome_csv, status from tarefa where ultima_carga=${cid} and orfa=true`);
  const naoEnc = await contagem(`select t.chave, t.nome, t.motivo_nao_encontrado, p.nome projeto from tarefa t left join projeto p on p.codigo=t.projeto_codigo where t.nao_encontrado_desde=${cid} order by 1 limit 50`);

  // arquiteta vê só as próprias pendências
  const filtroPessoa = u.perfil === "arquiteta" ? u.email : sp.pessoa;
  const classe = sp.classe && rotulo[sp.classe] ? sp.classe : null;
  const detalhe = classe ? await contagem(
    `select t.nome, t.etapa_canonica, t.status, t.data_inicio, t.data_fim, t.responsavel_nome, p.codigo, p.nome projeto
     from tarefa t left join projeto p on p.codigo=t.projeto_codigo
     where t.ultima_carga=${cid} and t.classe_qualidade='${classe}' ${filtroPessoa ? `and t.responsavel_email='${filtroPessoa.replace(/'/g, "''")}'` : ""}
     order by p.nome, t.etapa_canonica, t.nome limit 300`) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Qualidade dos dados</h1>
        <p className="text-sm text-[var(--muted)]">Carga {cid} de {carga.dataCarga}. Dados incompletos na fonte são limitação e contexto gerencial: dizem o que os indicadores conseguem ou não medir. Não são avaliação de pessoas e não geram tarefas, cobranças ou alterações no Vobi.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="font-semibold mb-2">Tarefas por classe de completude</div>
          <table className="w-full text-sm"><thead><tr><th>Classe</th><th>Tarefas</th><th>Entra em</th></tr></thead><tbody>
            {porClasse.map((r) => <tr key={String(r.k)}><td><Link className="underline" href={`/qualidade?classe=${r.k}`}>{rotulo[String(r.k)] ?? String(r.k)}</Link></td><td>{String(r.n)}</td><td className="text-xs text-[var(--muted)]">{entraEm[String(r.k)]}</td></tr>)}
          </tbody></table>
        </div>
        <div className="card">
          <div className="font-semibold mb-2">Alertas da carga</div>
          <table className="w-full text-sm"><tbody>{alertas.map((r) => <tr key={String(r.k)}><td>{String(r.k)}</td><td className="text-right">{String(r.n)}</td></tr>)}</tbody></table>
        </div>
      </div>
      {veIndicadoresIndividuais(u.perfil) && (
        <div className="card">
          <div className="font-semibold mb-2">Dados incompletos na fonte — projetos com mais tarefas incompletas</div>
          <p className="text-xs text-[var(--muted)] mb-2">Contexto para leitura dos indicadores por projeto; o link abre o projeto no Vobi apenas para consulta.</p>
          <table className="w-full text-sm"><thead><tr><th>Tarefas incompletas</th><th>Projeto</th><th>Projeto no Vobi</th></tr></thead><tbody>
            {piores.map((r) => <tr key={String(r.codigo)}><td>{String(r.n)}</td><td>{String(r.nome)}</td><td><a className="underline" target="_blank" rel="noreferrer" href={linkVobiProjeto(Number(r.codigo))}>{String(r.codigo)}</a></td></tr>)}
          </tbody></table>
        </div>
      )}
      {veIndicadoresIndividuais(u.perfil) && (
        <div className="card">
          <div className="font-semibold mb-2">Dados incompletos por arquiteta (tarefas abertas)</div>
          <p className="text-xs text-[var(--muted)] mb-2">Contexto de carga e cobertura dos indicadores por pessoa, para leitura da gestão e coordenação. Não é lista de pendências nem medida de desempenho: uma tarefa sem prazo no Vobi limita o que se mede, não diz como a pessoa trabalha.</p>
          <table className="w-full text-sm"><thead><tr><th>Responsável</th><th>Abertas</th><th>Completas</th><th>Sem prazo</th><th>Sem início</th><th>Cobertura</th></tr></thead><tbody>
            {porPessoa.map((r) => { const t = Number(r.total), c = Number(r.completas); return (
              <tr key={String(r.k)}><td>{r.e ? <Link className="underline" href={`/qualidade?classe=incompleta_sem_prazo&pessoa=${encodeURIComponent(String(r.e))}`}>{String(r.k)}</Link> : String(r.k)}</td><td>{t}</td><td>{c}</td><td>{String(r.sem_prazo)}</td><td>{String(r.sem_inicio)}</td><td>{t ? Math.round((c / t) * 100) : 0}%</td></tr>); })}
          </tbody></table>
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card"><div className="font-semibold mb-2">Etapas não mapeadas</div>
          <table className="w-full text-sm"><tbody>{etapas.map((r) => <tr key={String(r.k)}><td>{String(r.k)}</td><td className="text-right">{String(r.n)}</td></tr>)}{!etapas.length && <tr><td className="text-[var(--muted)]">nenhuma</td></tr>}</tbody></table>
          <p className="text-xs text-[var(--muted)] mt-2">Etapas fora da tabela de sinônimos do A360; ficam agrupadas por nome até a gestão decidir a classificação.</p></div>
        <div className="card"><div className="font-semibold mb-2">Pessoas sem e-mail</div>
          <ul className="text-sm">{pessoas.map((r) => <li key={String(r.k)}>{String(r.k)}</li>)}{!pessoas.length && <li className="text-[var(--muted)]">nenhuma</li>}</ul>
          <p className="text-xs text-[var(--muted)]">Sem e-mail, a pessoa fica fora dos indicadores individuais. <Link href="/pessoas" className="underline">Pessoas</Link></p></div>
        <div className="card"><div className="font-semibold mb-2">Colisões de chave e órfãs</div>
          <ul className="text-sm">
            {colisoes.map((r) => <li key={String(r.chave)}><span className="badge badge-warn">colisão</span> {String(r.projeto ?? "?")} · {String(r.etapa_canonica)} · &ldquo;{String(r.nome) || "(sem nome)"}&rdquo;</li>)}
            {orfas.map((r) => <li key={String(r.chave)}><span className="badge badge-bad">órfã</span> projeto &ldquo;{String(r.projeto_nome_csv) || "(vazio)"}&rdquo; · &ldquo;{String(r.nome) || "(sem nome)"}&rdquo;</li>)}
            {!colisoes.length && !orfas.length && <li className="text-[var(--muted)]">nenhuma</li>}
          </ul></div>
      </div>
      {naoEnc.length > 0 && (
        <div className="card"><div className="font-semibold mb-2">Não encontradas nesta carga (mantidas no histórico; nada foi apagado)</div>
          <table className="w-full text-sm"><thead><tr><th>Projeto</th><th>Tarefa</th><th>Motivo</th></tr></thead><tbody>
            {naoEnc.map((r) => <tr key={String(r.chave)}><td>{String(r.projeto ?? "?")}</td><td>{String(r.nome)}</td><td>{String(r.motivo_nao_encontrado)}</td></tr>)}
          </tbody></table></div>
      )}
      {classe && (
        <div className="card">
          <div className="font-semibold mb-2">{rotulo[classe]} {filtroPessoa && <span className="text-xs text-[var(--muted)]">· {filtroPessoa}</span>}</div>
          <p className="text-xs text-[var(--muted)] mb-2">{u.perfil === "arquiteta" ? "Suas tarefas cujos dados no Vobi estão incompletos: elas ficam fora de alguns indicadores. Nenhuma ação é exigida aqui." : "Detalhe para contexto gerencial; o link abre o projeto no Vobi apenas para consulta."}</p>
          <table className="w-full text-sm"><thead><tr><th>Projeto</th><th>Etapa</th><th>Tarefa</th><th>Status</th><th>Início</th><th>Fim</th><th>Responsável</th><th>Projeto no Vobi</th></tr></thead><tbody>
            {detalhe.map((r, i) => <tr key={i}><td>{String(r.projeto ?? "?")}</td><td>{String(r.etapa_canonica)}</td><td>{String(r.nome)}</td><td>{String(r.status)}</td><td>{String(r.data_inicio ?? "—")}</td><td>{String(r.data_fim ?? "—")}</td><td>{String(r.responsavel_nome ?? "—")}</td><td>{r.codigo ? <a className="underline" target="_blank" rel="noreferrer" href={linkVobiProjeto(Number(r.codigo))}>consultar</a> : "—"}</td></tr>)}
            {!detalhe.length && <tr><td colSpan={8} className="text-[var(--muted)]">nenhuma</td></tr>}
          </tbody></table>
        </div>
      )}
    </div>
  );
}
