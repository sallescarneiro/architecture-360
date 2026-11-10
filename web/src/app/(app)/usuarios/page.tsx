import { NOME_PERFIL, PERFIS, exigirUsuario, listarUsuarios, type Perfil } from "@/lib/auth";
import { Alert, Badge, Button, Card, PageHeader, Select } from "@/components/ui";
import { NovoUsuarioForm, RedefinirSenha } from "@/components/usuarios/Formularios";
import { alterarPerfilAction, ativarAction } from "./actions";

export const metadata = { title: "Usuários — Architecture 360" };

/**
 * T-205 — Gestão de usuários (só administração). Decisão de Rodrigo em 10/11/2026: a equipe passa a ter acesso,
 * com perfil definido pela direção. Sem cadastro público, sem e-mail automático: a senha provisória é mostrada
 * uma vez ao administrador, que a entrega pessoalmente; a pessoa troca no primeiro acesso.
 */
export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const u = await exigirUsuario(["admin"]);
  const sp = await searchParams;
  const lista = await listarUsuarios();
  const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");
  const ordem: Record<string, number> = { admin: 0, gestao: 1, coordenacao: 2, arquiteta: 3 };
  const ordenada = [...lista].sort((a, b) => (ordem[a.perfil] - ordem[b.perfil]) || a.nome.localeCompare(b.nome, "pt-BR"));
  const ativos = lista.filter((x) => x.ativo).length;
  const OK: Record<string, string> = { perfil: "Perfil alterado.", desativado: "Acesso desativado e sessões encerradas.", reativado: "Acesso reativado." };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Administração" title="Usuários"
        subtitle={<>{lista.length} cadastrados · {ativos} ativos. As permissões são verificadas no servidor em cada tela; o perfil define o que a pessoa vê. Senhas ficam só como hash; a provisória aparece uma única vez para quem a cria.</>} />
      {sp.ok && OK[sp.ok] && <Alert kind="success">{OK[sp.ok]}</Alert>}
      {sp.erro && <Alert>{sp.erro}</Alert>}

      <Card title="Novo acesso" subtitle="Nome completo, e-mail corporativo e perfil. O sistema gera a senha provisória; a pessoa é obrigada a trocá-la ao entrar.">
        <NovoUsuarioForm />
      </Card>

      <Card title="Acessos" subtitle="Alterar perfil aplica no próximo carregamento de página. Desativar encerra as sessões na hora; reativar não gera senha nova (use Redefinir senha se precisar).">
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th><th>Último acesso</th><th>Criado em</th><th>Ações</th></tr></thead><tbody>
          {ordenada.map((x) => {
            const eu = x.id === u.id;
            return (
              <tr key={x.id} className={x.ativo ? "" : "opacity-60"}>
                <td className="font-semibold">{x.nome}{eu && <span className="ml-1.5 text-[0.7rem] font-normal text-[var(--muted)]">(você)</span>}</td>
                <td className="text-[var(--txt-2)]">{x.email}</td>
                <td>
                  <form action={alterarPerfilAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={x.id} />
                    <Select name="perfil" defaultValue={x.perfil} aria-label={`Perfil de ${x.nome}`} className="min-w-[9rem]">{PERFIS.map((p: Perfil) => <option key={p} value={p}>{NOME_PERFIL[p]}</option>)}</Select>
                    <Button variant="secondary" className="btn-sm">Salvar</Button>
                  </form>
                </td>
                <td>
                  <div className="flex flex-col gap-1">
                    <Badge tone={x.ativo ? "ok" : "neutral"}>{x.ativo ? "ativo" : "desativado"}</Badge>
                    {x.trocarSenha && <Badge tone="warn">troca de senha pendente</Badge>}
                  </div>
                </td>
                <td className="whitespace-nowrap text-[var(--txt-2)]">{fmt(x.ultimoAcessoEm)}</td>
                <td className="whitespace-nowrap text-[var(--txt-2)]">{fmt(x.criadoEm)}</td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RedefinirSenha id={x.id} nome={x.nome} email={x.email} />
                    {!eu && (
                      <form action={ativarAction}>
                        <input type="hidden" name="id" value={x.id} /><input type="hidden" name="ativo" value={x.ativo ? "0" : "1"} />
                        <Button variant={x.ativo ? "danger" : "secondary"} className="btn-sm">{x.ativo ? "Desativar" : "Reativar"}</Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody></table></div>
      </Card>

      <p className="text-[0.75rem] text-[var(--muted)]">Perfis: Arquiteta vê o próprio dia, tarefas, projetos, agenda e reuniões de que participa. Coordenação acrescenta Painel operacional, Alertas e Pessoas. Gestão acrescenta Painel executivo e Importação Vobi. Administração acrescenta Usuários e integrações. O Vobi continua somente leitura para todos.</p>
    </div>
  );
}
