import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeEscrever } from "@/lib/agenda/google";
import { apoioFormulario, voltaDe } from "@/lib/agenda/formulario";
import { diaValido, hojeLocal } from "@/lib/agenda/datas";
import { FormularioEvento } from "@/components/agenda/FormularioEvento";
import { LinkButton, PageHeader } from "@/components/ui";
import { criarEventoAction } from "../actions";

/** Novo compromisso: criado no Google Agenda do usuário (D6) e espelhado em seguida. */
export default async function NovoEventoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const volta = voltaDe(sp);
  const { c, projetos, calendarios, pessoas } = await apoioFormulario(u.id);
  if (!c || c.estado === "revogada") redirect("/agenda/conexao");
  if (!podeEscrever(c.escopos)) redirect("/agenda/conexao?precisa=escrita");
  const data = diaValido(sp.d) ? sp.d : hojeLocal();
  const h = /^\d{2}:\d{2}$/.test(sp.h ?? "") ? sp.h! : "09:00";
  const fim = `${String((Number(h.slice(0, 2)) + 1) % 24).padStart(2, "0")}:${h.slice(3)}`;
  const primario = calendarios.find((k) => k.primario)?.id ?? calendarios[0]?.id ?? "primary";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Novo compromisso" subtitle={<>Será criado na sua Google Agenda ({c.emailGoogle}) e aparecerá aqui em seguida.</>} actions={<LinkButton href={volta}>← Voltar</LinkButton>} />
      <FormularioEvento action={criarEventoAction} volta={volta} projetos={projetos} calendarios={calendarios} pessoas={pessoas} erro={sp.erro}
        valores={{ titulo: "", descricao: "", local: "", data, diaInteiro: false, horaInicio: h, horaFim: fim, participantes: "", projetoCodigo: /^\d+$/.test(sp.projeto ?? "") ? Number(sp.projeto) : null, criarMeet: false, calendarioId: primario, enviarConvites: true }} />
    </div>
  );
}
