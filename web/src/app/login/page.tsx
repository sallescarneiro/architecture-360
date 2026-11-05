"use client";
import { useActionState } from "react";
import { entrarAction } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(entrarAction, undefined);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <form action={action} className="card w-full max-w-sm flex flex-col gap-3">
        <div>
          <div className="text-lg font-bold">Architecture 360</div>
          <div className="text-xs text-[var(--muted)]">Acesso por usuário e senha cadastrados.</div>
        </div>
        <label className="text-sm">E-mail<input name="email" type="email" required className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-2" /></label>
        <label className="text-sm">Senha<input name="senha" type="password" required className="mt-1 w-full rounded-md border border-[var(--line)] px-3 py-2" /></label>
        {state?.erro && <div className="text-sm text-red-700">{state.erro}</div>}
        <button className="btn btn-primary" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
