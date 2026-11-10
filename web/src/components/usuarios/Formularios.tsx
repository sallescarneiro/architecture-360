"use client";
import { useActionState, useState } from "react";
import { criarUsuarioAction, redefinirSenhaAction, type EstadoSenha } from "@/app/(app)/usuarios/actions";
import { Alert, Button, Field, Input, Select } from "@/components/ui";

const PERFIS = [
  { v: "arquiteta", l: "Arquiteta — Meu Dia, Tarefas, Projetos, Agenda, Reuniões" },
  { v: "coordenacao", l: "Coordenação — + Painel operacional, Alertas, Pessoas" },
  { v: "gestao", l: "Gestão — + Painel executivo, Importação Vobi" },
  { v: "admin", l: "Administração — tudo, inclusive Usuários e integrações" },
];

/** Senha provisória exibida uma única vez; sai da tela ao recarregar e nunca é gravada em texto puro. */
function SenhaProvisoria({ s, onFechar }: { s: NonNullable<EstadoSenha>; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Acesso ao Architecture 360\nEndereço: ${typeof window !== "undefined" ? window.location.origin : ""}\nE-mail: ${s.email}\nSenha provisória: ${s.senhaProvisoria}\nNo primeiro acesso o sistema pede uma senha nova.`;
  const copiar = async () => { try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); } };
  return (
    <div className="rounded-[10px] border border-[var(--ok,#2e7d32)] bg-[var(--ok-bg,#eef7ee)] p-4" role="status">
      <p className="text-[0.85rem] font-semibold">Acesso criado para {s.nome} ({s.email}).</p>
      <p className="mt-1 text-[0.82rem] text-[var(--txt-2)]">Esta senha provisória aparece <strong>uma única vez</strong>. Entregue-a à pessoa por um canal seu; no primeiro acesso ela será obrigada a definir uma senha nova.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="select-all rounded bg-white px-3 py-1.5 text-[1rem] tracking-wider" data-testid="senha-provisoria">{s.senhaProvisoria}</code>
        <Button type="button" variant="secondary" onClick={copiar}>{copiado ? "Copiado" : "Copiar instruções"}</Button>
        <Button type="button" variant="ghost" onClick={onFechar}>Fechar</Button>
      </div>
    </div>
  );
}

export function NovoUsuarioForm() {
  const [state, action, pending] = useActionState(criarUsuarioAction, undefined);
  const [fechado, setFechado] = useState<string | null>(null);
  const mostrar = state?.senhaProvisoria && fechado !== state.senhaProvisoria;
  return (
    <div className="space-y-4">
      {mostrar && <SenhaProvisoria s={state!} onFechar={() => setFechado(state!.senhaProvisoria!)} />}
      <form action={action} className="grid gap-3 md:grid-cols-[1.2fr_1.4fr_1.6fr_auto] md:items-end" key={state?.senhaProvisoria ?? "novo"}>
        <Field label="Nome completo"><Input name="nome" required minLength={3} autoComplete="off" /></Field>
        <Field label="E-mail @rucelle.com.br"><Input name="email" type="email" required autoComplete="off" placeholder="nome.sobrenome@rucelle.com.br" /></Field>
        <Field label="Perfil"><Select name="perfil" defaultValue="arquiteta">{PERFIS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}</Select></Field>
        <Button disabled={pending}>{pending ? "Criando…" : "Criar acesso"}</Button>
        {state?.erro && <div className="md:col-span-4"><Alert>{state.erro}</Alert></div>}
      </form>
    </div>
  );
}

export function RedefinirSenha({ id, nome, email }: { id: number; nome: string; email: string }) {
  const [state, action, pending] = useActionState(redefinirSenhaAction, undefined);
  const [fechado, setFechado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const mostrar = state?.senhaProvisoria && fechado !== state.senhaProvisoria;
  if (mostrar) return <div className="min-w-[18rem]"><SenhaProvisoria s={state!} onFechar={() => { setFechado(state!.senhaProvisoria!); setConfirmar(false); }} /></div>;
  if (!confirmar) return <Button type="button" variant="ghost" className="btn-sm" onClick={() => setConfirmar(true)} title="Gera uma senha provisória nova e encerra as sessões da pessoa">Redefinir senha</Button>;
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="nome" value={nome} /><input type="hidden" name="email" value={email} />
      <span className="text-[0.75rem] text-[var(--txt-2)]">Encerra as sessões de {nome.split(" ")[0]} e gera senha nova.</span>
      <Button variant="secondary" className="btn-sm" disabled={pending}>{pending ? "Gerando…" : "Confirmar"}</Button>
      <Button type="button" variant="ghost" className="btn-sm" onClick={() => setConfirmar(false)}>Cancelar</Button>
      {state?.erro && <Alert>{state.erro}</Alert>}
    </form>
  );
}
