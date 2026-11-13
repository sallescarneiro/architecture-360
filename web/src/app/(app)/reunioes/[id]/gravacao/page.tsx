import { notFound, redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { FORMAS_AVISO, PLATAFORMAS, podeEditar, reuniaoPorId } from "@/lib/reunioes";
import { FORMATOS_ACEITOS } from "@/lib/transcricao/extrair";
import { dataHora } from "@/lib/agenda/datas";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { Button, LinkButton, PageHeader } from "@/components/ui";
import { registrarGravacaoAction } from "../../actions";

const seguro = (s?: string) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "/reunioes");

/**
 * T-227 — Registrar gravação (só o link) e transcrição (só o texto). O aviso de gravação é obrigatório e fica registrado
 * com nome, data e hora; sem ele, nada é salvo. Áudio e vídeo nunca são enviados ao A360.
 */
export default async function GravacaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = seguro(sp.volta);
  if (!/^\d+$/.test(id)) notFound();
  const r = await reuniaoPorId(Number(id)); if (!r) notFound();
  if (!(await podeEditar(u, r))) redirect(`/reunioes/${r.id}?erro=${encodeURIComponent("Você não pode alterar esta reunião.")}`);
  const projeto = r.projetoCodigo ? (await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, r.projetoCodigo)).limit(1))[0] : null;
  const avisoPor = r.avisoGravacaoPor ? (await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, r.avisoGravacaoPor)).limit(1))[0]?.nome : null;
  const lbl = "block text-xs font-semibold text-[var(--txt-2)]";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow={`${r.titulo}${projeto ? ` · projeto nº ${r.projetoCodigo}` : ""}`} title="Registrar gravação e transcrição"
        subtitle="A gravação continua na plataforma de origem. O A360 guarda o link, os dados da gravação e o texto integral da transcrição, nunca o áudio ou o vídeo."
        actions={<LinkButton href={`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}`}>← Voltar à reunião</LinkButton>} />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}

      <form action={registrarGravacaoAction} encType="multipart/form-data" className="flex flex-col gap-4">
        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} />

        {r.avisoGravacaoEm ? (
          <section className="card flex flex-col gap-1 p-4" aria-labelledby="aviso-tit">
            <h2 id="aviso-tit" className="text-[0.95rem] font-semibold">1 · Aviso de gravação</h2>
            <p className="rounded-[10px] bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok)]"><b>Participantes informados sobre a gravação</b> · {FORMAS_AVISO[r.avisoGravacaoForma ?? ""]?.toLowerCase()} · registrado por {avisoPor ?? "—"} em {dataHora(r.avisoGravacaoEm)}</p>
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-[12px] border-2 border-[var(--terracota)] bg-[#fdf4f1] p-4" aria-labelledby="aviso-tit">
            <h2 id="aviso-tit" className="text-[0.95rem] font-semibold">1 · Aviso de gravação (obrigatório)</h2>
            <label className="flex items-start gap-2.5 text-sm font-semibold"><input type="checkbox" name="aviso" value="1" required className="mt-0.5" style={{ width: 20, height: 20 }} /> Os participantes foram informados de que a reunião foi gravada e transcrita.</label>
            <label className={lbl}>Como foram informados
              <select name="aviso_forma" required className="input mt-1" defaultValue="inicio">{Object.entries(FORMAS_AVISO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
            <p className="text-xs text-[var(--muted)]">Fica registrado com o seu nome, a data e a hora. Sem esse registro, o link e a transcrição não são salvos.</p>
          </section>
        )}

        <section className="card flex flex-col gap-3 p-4" aria-labelledby="grav-tit">
          <h2 id="grav-tit" className="text-[0.95rem] font-semibold">2 · Gravação (link)</h2>
          <label className={lbl}>Link da gravação
            <input name="gravacao_url" type="url" defaultValue={r.gravacaoUrl ?? ""} className="input mt-1" placeholder="https://drive.google.com/file/d/…" />
            <span className="sub font-normal">Drive, Meet, Zoom ou Teams. O A360 não baixa nem copia o vídeo. Quem abre o link é registrado.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={lbl}>Plataforma<select name="gravacao_plataforma" className="input mt-1" defaultValue={r.gravacaoPlataforma ?? "drive"}>{Object.entries(PLATAFORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className={lbl}>Data da gravação<input type="date" name="gravacao_data" defaultValue={r.gravacaoData ?? ""} className="input mt-1" /></label>
            <label className={lbl}>Duração (min)<input type="number" name="gravacao_duracao" min={1} max={999} defaultValue={r.gravacaoDuracaoMin ?? ""} className="input mt-1" /></label>
          </div>
        </section>

        <section className="card flex flex-col gap-3 p-4" aria-labelledby="tr-tit">
          <h2 id="tr-tit" className="text-[0.95rem] font-semibold">3 · Transcrição (texto integral)</h2>
          <label className={lbl}>Enviar arquivo <span className="font-normal text-[var(--muted)]">({FORMATOS_ACEITOS.join(", ")} · até 15 MB · o A360 guarda só o texto, com nome, tamanho e impressão digital do arquivo)</span>
            <input type="file" name="arquivo" accept={FORMATOS_ACEITOS.join(",")} className="input mt-1" />
          </label>
          <label className={lbl}>ou colar o texto
            <textarea name="colado" rows={5} className="input mt-1" placeholder="Cole aqui a transcrição completa, com as marcações de tempo quando houver (ex.: 00:12:30 Thaís: …)" />
          </label>
          <label className={lbl}>Link do arquivo original no Drive (recomendado)
            <input name="link_original" type="url" className="input mt-1" placeholder="https://docs.google.com/document/d/…" />
            <span className="sub font-normal">O arquivo continua no Drive; o A360 guarda o link para conferência. Se enviar arquivo e texto colado, vale o arquivo.</span>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="processar" value="1" /> gerar a ata com IA depois de salvar</label>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Salvar gravação e transcrição</Button>
          <LinkButton href={`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}`}>Cancelar</LinkButton>
          {!r.avisoGravacaoEm && <span className="rounded-[8px] bg-[var(--warn-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--warn)]">Marque o aviso de gravação (passo 1) para salvar.</span>}
        </div>
      </form>
    </div>
  );
}
