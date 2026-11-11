"use client";
import { useActionState } from "react";
import { enviarAction, type EstadoUpload } from "./actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function UploadForm({ hoje }: { hoje: string }) {
  const [state, action, pending] = useActionState<EstadoUpload, FormData>(enviarAction, undefined);
  return (
    <Card title="Carga por CSV (contingência)" subtitle={<>Use quando a sincronização pela API estiver indisponível. No Vobi: <b>Projetos › Ações › Exportar CSV</b> (sem filtro), <b>Gestão de Tarefas › Tarefas › Todas as tarefas › Ações › Exportar CSV</b> e, opcionalmente, <b>Cadastros › Contatos › Clientes › Ações › Exportar CSV</b>. Nada é gravado antes da confirmação; o Vobi nunca é alterado.</>}>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Projetos.csv"><Input name="projetos" type="file" accept=".csv,text/csv" /></Field>
          <Field label="Tarefas.csv"><Input name="tarefas" type="file" accept=".csv,text/csv" /></Field>
          <Field label="Clientes.csv (opcional)" hint="Só código, nome, razão social, tipo, status, e-mail, telefone, cidade/UF e data de criação entram; CPF/CNPJ, RG/IE, nascimento, endereço e observações são descartados na leitura."><Input name="clientes" type="file" accept=".csv,text/csv" /></Field>
          <Field label="Data da exportação"><Input name="dataCarga" type="date" defaultValue={hoje} required /></Field>
        </div>
        <p className="text-xs text-[var(--muted)]">Projetos e Tarefas vão sempre juntos (carga de operação). Clientes pode vir junto ou sozinho (carga só de clientes). O vínculo projeto × cliente é recalculado em toda carga.</p>
        {state?.erro && <Alert><span className="whitespace-pre-wrap">{state.erro}</span></Alert>}
        <div><Button disabled={pending}>{pending ? "Analisando…" : "Gerar prévia"}</Button></div>
      </form>
    </Card>
  );
}
