"use client";
import { useActionState } from "react";
import { entrarAction } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(entrarAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail"><Input name="email" type="email" autoComplete="username" required /></Field>
      <Field label="Senha"><Input name="senha" type="password" autoComplete="current-password" required /></Field>
      {state?.erro && <Alert>{state.erro}</Alert>}
      <Button className="w-full" disabled={pending}>{pending ? "Entrando…" : "Entrar"}</Button>
    </form>
  );
}
