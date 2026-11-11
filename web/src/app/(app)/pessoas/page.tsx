import { and, asc, desc, eq } from "drizzle-orm";
import type { Relatorio } from "@/lib/importador/importador";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { estadoOrganizacao } from "@/lib/integracoes/people";
import { mapearPessoaAction, nomearResponsavelVobiAction, sincronizarPeopleAction } from "./actions";
import { Alert, Badge, Button, Card, Empty, Input, PageHeader } from "@/components/ui";

/**
 * Pessoas — duas coisas, separadas de propósito:
 *  1. Estrutura organizacional: vem do People Rucelle (fonte oficial), espelhada aqui somente para leitura.
 *     O A360 não cadastra cargos, gestores, coordenadores ou arquitetas; o que o People não informar é "dado ausente".
 *  2. Vínculo técnico Vobi → e-mail: o Vobi exporta só o nome do responsável; o e-mail @rucelle é a chave comum
 *     com o People. Esse vínculo é o único dado mantido pelo A360, e serve apenas para cruzar as duas fontes.
 */
export default async function PessoasPage() {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const edita = podeImportar(u.perfil);
  const vobi = await db.select().from(schema.pessoasVobi).orderBy(asc(schema.pessoasVobi.origem), asc(schema.pessoasVobi.nomeVobi));
  const people = await db.select().from(schema.pessoasPeople).orderBy(asc(schema.pessoasPeople.nome));
  const org = await estadoOrganizacao();
  const porEmail = new Map(people.map((p) => [p.email, p]));
  const nomeDe = (email: string | null) => (email ? porEmail.get(email)?.nome ?? email : null);
  const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);
  // T-218: responsáveis que a API do Vobi informa só por número
  const mapaResp = await db.select().from(schema.vobiResponsaveis).orderBy(asc(schema.vobiResponsaveis.nome));
  const ultimaApi = (await db.select({ relatorio: schema.cargas.relatorio }).from(schema.cargas)
    .where(and(eq(schema.cargas.origem, "api"))).orderBy(desc(schema.cargas.id)).limit(1))[0];
  const semNome = ((ultimaApi?.relatorio as Relatorio | null)?.api?.responsaveis.semNome ?? []).filter((r) => !mapaResp.some((m) => m.idVobi === r.id));
  const nomesVobi = vobi.map((p) => p.nomeVobi).filter((n) => !n.startsWith("Vobi #"));
  const editaResp = edita || u.perfil === "coordenacao";
  const seletor = (idVobi: number, atual?: string) => (
    <form action={nomearResponsavelVobiAction} className="flex items-center gap-2">
      <input type="hidden" name="idVobi" value={idVobi} />
      <select name="nome" defaultValue={atual ?? ""} className="input w-72" required>
        <option value="" disabled>Escolha a pessoa do Vobi…</option>
        {nomesVobi.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <Button variant="secondary" className="btn-sm">Salvar</Button>
    </form>
  );
  const ausente = <span className="text-[var(--muted)]" title="Não informado pelo People">dado ausente</span>;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Dados" title="Pessoas"
        subtitle="A estrutura organizacional (cargos, gestores, coordenadores, vínculos) vem do People Rucelle e é apenas exibida aqui. O Architecture 360 não mantém cadastro próprio de pessoas: o único dado seu é o vínculo entre o nome exportado pelo Vobi e o e-mail @rucelle."
        actions={u.perfil === "admin" && <form action={sincronizarPeopleAction}><Button variant="secondary" disabled={!org.configurado} title={org.configurado ? "Ler o People agora" : "Defina PEOPLE_URL e PEOPLE_TOKEN no serviço"}>Atualizar do People</Button></form>} />

      <Card title={<>Estrutura organizacional <Badge tone="neutral">fonte: People</Badge></>}
        subtitle={org.sincronizadoEm ? <>Última leitura do People em {fmt(org.sincronizadoEm)} · {org.pessoas} pessoas.</> : "Ainda não recebida."}>
        {!org.configurado && <div className="mb-3"><Alert kind="info">Integração com o People pendente: o endpoint de exportação do People ainda não está disponível para o Architecture 360 (variáveis <code>PEOPLE_URL</code> e <code>PEOPLE_TOKEN</code> não definidas). Enquanto isso, a hierarquia é tratada como dado ausente — nada é inventado nem cadastrado aqui.</Alert></div>}
        {org.configurado && org.ultima && org.ultima.status !== "ok" && <div className="mb-3"><Alert kind="warn">Última tentativa em {fmt(org.ultima.em)}: {org.ultima.status} — {org.ultima.motivo}. Mantidos os dados da leitura anterior, se houver.</Alert></div>}
        {people.length ? (
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Função</th><th>Equipe</th><th>Gestor(a)</th><th>Coordenador(a)</th><th>Situação</th></tr></thead><tbody>
            {people.map((p) => <tr key={p.email}><td className="font-semibold">{p.nome}</td><td className="text-[var(--txt-2)]">{p.email}</td><td>{p.cargo ?? ausente}</td><td>{p.funcao ?? ausente}</td><td>{p.equipe ?? ausente}</td><td>{nomeDe(p.gestorEmail) ?? ausente}</td><td>{nomeDe(p.coordenadorEmail) ?? ausente}</td><td>{p.ativo == null ? ausente : <Badge tone={p.ativo ? "ok" : "neutral"}>{p.ativo ? "ativa" : "inativa"}</Badge>}</td></tr>)}
          </tbody></table></div>
        ) : <Empty>Nenhuma informação organizacional recebida do People até agora.</Empty>}
      </Card>

      {(semNome.length > 0 || mapaResp.length > 0) && (
        <Card title={<>Responsáveis da API do Vobi <Badge tone={semNome.length ? "warn" : "neutral"}>{semNome.length ? `${semNome.length} sem nome` : "todos identificados"}</Badge></>}
          subtitle="A API do Vobi informa o responsável de cada tarefa só por um número. O A360 reconhece sozinho quem já aparecia na última exportação CSV; os demais são indicados aqui uma única vez e valem para todas as sincronizações seguintes.">
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Nº no Vobi</th><th>Pessoa</th><th>Como foi identificado</th></tr></thead><tbody>
            {semNome.map((r) => <tr key={`s${r.id}`}><td className="font-semibold">#{r.id}</td><td>{editaResp ? seletor(r.id) : "—"}</td><td><Badge tone="warn">sem nome · {r.tarefas} tarefa(s)</Badge></td></tr>)}
            {mapaResp.map((m) => <tr key={m.idVobi}><td className="font-semibold">#{m.idVobi}</td><td>{editaResp ? seletor(m.idVobi, m.nome) : m.nome}</td><td><Badge tone="neutral">{m.origem === "manual" ? "indicado na tela Pessoas" : "pela última exportação CSV"}</Badge></td></tr>)}
          </tbody></table></div>
        </Card>
      )}

      <Card title={<>Nomes do Vobi → e-mail @rucelle <Badge tone="neutral">vínculo técnico</Badge></>}
        subtitle="O Vobi exporta apenas o nome do responsável. O e-mail é a chave comum com o People e nunca é inferido: sem ele, a pessoa fica fora dos indicadores individuais e sem hierarquia.">
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Nome no Vobi</th><th>E-mail @rucelle</th><th>Origem do vínculo</th><th>No People</th></tr></thead><tbody>
          {vobi.filter((p) => !p.nomeVobi.startsWith("Vobi #")).map((p) => {
            const pp = p.emailRucelle ? porEmail.get(p.emailRucelle) : undefined;
            return (
              <tr key={p.nomeVobi}><td className="font-semibold">{p.nomeVobi}</td>
                <td>{edita ? <form action={mapearPessoaAction} className="flex items-center gap-2"><input type="hidden" name="nome" value={p.nomeVobi} /><Input name="email" defaultValue={p.emailRucelle ?? ""} placeholder="nome.sobrenome@rucelle.com.br" className="w-72" /><Button variant="secondary" className="btn-sm">Salvar</Button></form> : (p.emailRucelle ?? "—")}</td>
                <td><Badge tone={p.origem === "nao_mapeada" ? "warn" : "neutral"}>{p.origem === "nao_mapeada" ? "sem e-mail" : p.origem}</Badge></td>
                <td>{pp ? <>{pp.cargo ?? "cargo não informado"}{pp.gestorEmail ? ` · gestor(a): ${nomeDe(pp.gestorEmail)}` : ""}</> : (p.emailRucelle && people.length ? <span className="text-[var(--muted)]">não encontrada no People</span> : ausente)}</td>
              </tr>);
          })}
          {!vobi.length && <tr><td colSpan={4} className="text-[var(--muted)]">Nenhum nome importado do Vobi ainda.</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  );
}
