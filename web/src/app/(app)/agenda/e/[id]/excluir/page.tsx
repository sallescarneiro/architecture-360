import { notFound, redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeEditar } from "@/lib/agenda/operacoes";
import { conexaoDe, eventoDe } from "@/lib/agenda/sync";
import { dataLonga, diaDe, hora } from "@/lib/agenda/datas";
import { voltaDe } from "@/lib/agenda/formulario";
import { Button, Card, LinkButton, PageHeader } from "@/components/ui";
import { excluirEventoAction } from "../../../actions";

/** Exclusão com confirmação explícita. Remove do Google Agenda (e, se houver participantes, pode avisá-los). */
export default async function ExcluirEventoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = voltaDe(sp);
  if (!/^\d+$/.test(id)) notFound();
  const e = await eventoDe(u.id, Number(id));
  if (!e) notFound();
  const c = await conexaoDe(u.id);
  if (!podeEditar(e, c)) redirect(`/agenda/e/${e.id}?erro=${encodeURIComponent("Só o organizador, com permissão de edição, pode excluir este compromisso.")}&volta=${encodeURIComponent(volta)}`);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader eyebrow="Architecture 360 · Agenda" title="Excluir compromisso" actions={<LinkButton href={`/agenda/e/${e.id}?volta=${encodeURIComponent(volta)}`}>← Voltar</LinkButton>} />
      {sp.erro && <div className="leitura leitura-bad"><b>Erro</b>{sp.erro}</div>}
      <Card title="Confirmação">
        <p className="text-sm"><b>{e.titulo}</b><br />{dataLonga(diaDe(e.inicio))}{e.diaInteiro ? " · dia inteiro" : ` · ${hora(e.inicio)}–${hora(e.fim)}`}{e.local ? ` · ${e.local}` : ""}{e.participantes.length ? ` · ${e.participantes.length} participante(s)` : ""}</p>
        <p className="mt-2 text-sm text-[var(--txt-2)]">O compromisso será excluído da sua Google Agenda. Acredito que o Google mantém eventos excluídos na lixeira do calendário por um período, de onde podem ser restaurados — confira lá se precisar desfazer.</p>
        <form action={excluirEventoAction} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={e.id} /><input type="hidden" name="volta" value={volta} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmo" value="1" required /> Confirmo a exclusão deste compromisso no Google Agenda.</label>
          {e.participantes.length > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="avisar" value="1" defaultChecked /> Avisar os participantes por e-mail (cancelamento).</label>}
          <div className="flex justify-end gap-2"><LinkButton href={`/agenda/e/${e.id}?volta=${encodeURIComponent(volta)}`}>Cancelar</LinkButton><Button variant="primary">Excluir do Google Agenda</Button></div>
        </form>
      </Card>
    </div>
  );
}
