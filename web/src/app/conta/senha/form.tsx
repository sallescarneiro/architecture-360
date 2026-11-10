"use client";
import { useActionState } from "react";
import { trocarSenhaAction } from "./actions";
import { Alert, Button, Field, Input } from "@/components/ui";

export function TrocarSenhaForm({ min }: { min: number }) {
  const [state, action, pending] = useActionState(trocarSenhaAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Senha atual (ou provisória)"><Input name="atual" type="password" autoComplete="current-password" required /></Field>
      <Field label="Nova senha" hint={`Mínimo de ${min} caracteres. Evite reutilizar senhas de outros serviços.`}><Input name="nova" type="password" autoComplete="new-password" required minLength={min} /></Field>
      <Field label="Repita a nova senha"><Input name="confirmacao" type="password" autoComplete="new-password" required minLength={min} /></Field>
      {state?.erro && <Alert>{state.erro}</Alert>}
      <Button className="w-full" disabled={pending}>{pending ? "Salvando…" : "Salvar nova senha"}</Button>
    </form>
  );
}
