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
 * T-227 — Registrar gravação (só o link) e/ou transcrição (só o texto), juntas ou separadas. A ciência dos participantes é
 * obrigatória e separada para cada uma (nome, data e hora). Áudio e vídeo nunca são enviados ao A360.
 */
export default async function GravacaoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id } = await params; const sp = await searchParams; const volta = seguro(sp.volta);
  if (!/^\d+$/.test(id)) notFound();
  const r = await reuniaoPorId(Number(id)); if (!r) notFound();
  if (!(await podeEditar(u, r))) redirect(`/reunioes/${r.id}?erro=${encodeURIComponent("Você não pode alterar esta reunião.")}`);
  const projeto = r.projetoCodigo ? (await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, r.projetoCodigo)).limit(1))[0] : null;
  const nomeDe = async (id: number | null) => id ? (await db.select({ nome: schema.usuarios.nome }).from(schema.usuarios).where(eq(schema.usuarios.id, id)).limit(1))[0]?.nome ?? null : null;
  const [porG, porT] = await Promise.all([nomeDe(r.avisoGravacaoPor), nomeDe(r.avisoTranscricaoPor)]);
  // ciência dos participantes: separada para gravação e transcrição; obrigatória só para o que for salvo
  const Aviso = ({ tipo, em, forma, por }: { tipo: "gravacao" | "transcricao"; em: Date | null; forma: string | null; por: string | null }) => {
    const nome = tipo === "gravacao" ? "gravação" : "transcrição";
    return em ? (
      <p className="rounded-[10px] bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok)]"><b>Participantes informados sobre a {nome}</b> · {FORMAS_AVISO[forma ?? ""]?.toLowerCase()} · registrado por {por ?? "—"} em {dataHora(em)}</p>
    ) : (
      <div className="flex flex-col gap-2 rounded-[12px] border-2 border-[var(--terracota)] bg-[#fdf4f1] p-3">
        <label className="flex items-start gap-2.5 text-sm font-semibold"><input type="checkbox" name={`aviso_${tipo}`} value="1" className="mt-0.5" style={{ width: 20, height: 20 }} /> Os participantes foram informados {tipo === "gravacao" ? "de que a reunião foi gravada" : "de que a reunião foi transcrita"}. <span className="font-normal text-[var(--muted)]">(obrigatório para salvar a {nome})</span></label>
        <label className={lbl}>Como foram informados
          <select name={`aviso_${tipo}_forma`} className="input mt-1" defaultValue="inicio">{Object.entries(FORMAS_AVISO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
      </div>
    );
  };
  const lbl = "block text-xs font-semibold text-[var(--txt-2)]";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader eyebrow={`${r.titulo}${projeto ? ` · projeto nº ${r.projetoCodigo}` : ""}`} title="Registrar gravação e transcrição"
        subtitle="Registre a gravação, a transcrição ou as duas. A gravação continua na plataforma de origem: o A360 guarda o link e o texto integral da transcrição, nunca o áudio ou o vídeo."
        actions={<LinkButton href={`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}`}>← Voltar à reunião</LinkButton>} />
      {sp.erro && <div className="leitura leitura-bad" role="alert"><b>Atenção</b>{sp.erro}</div>}

      <form action={registrarGravacaoAction} encType="multipart/form-data" className="flex flex-col gap-4">
        <input type="hidden" name="id" value={r.id} /><input type="hidden" name="volta" value={volta} />

        <section className="card flex flex-col gap-3 p-4" aria-labelledby="grav-tit">
          <h2 id="grav-tit" className="text-[0.95rem] font-semibold">Gravação (link) <span className="text-xs font-normal text-[var(--muted)]">· opcional</span></h2>
          <label className={lbl}>Link da gravação
            <input name="gravacao_url" type="url" defaultValue={r.gravacaoUrl ?? ""} className="input mt-1" placeholder="https://drive.google.com/file/d/…" />
            <span className="sub font-normal">Drive, Meet, Zoom ou Teams. O A360 não baixa nem copia o vídeo. Quem abre o link é registrado.</span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className={lbl}>Plataforma<select name="gravacao_plataforma" className="input mt-1" defaultValue={r.gravacaoPlataforma ?? "drive"}>{Object.entries(PLATAFORMAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className={lbl}>Data da gravação<input type="date" name="gravacao_data" defaultValue={r.gravacaoData ?? ""} className="input mt-1" /></label>
            <label className={lbl}>Duração (min)<input type="number" name="gravacao_duracao" min={1} max={999} defaultValue={r.gravacaoDuracaoMin ?? ""} className="input mt-1" /></label>
          </div>
          <Aviso tipo="gravacao" em={r.avisoGravacaoEm} forma={r.avisoGravacaoForma} por={porG} />
        </section>

        <section className="card flex flex-col gap-3 p-4" aria-labelledby="tr-tit">
          <h2 id="tr-tit" className="text-[0.95rem] font-semibold">Transcrição (texto integral) <span className="text-xs font-normal text-[var(--muted)]">· opcional · pode ser registrada sem gravação</span></h2>
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
          <Aviso tipo="transcricao" em={r.avisoTranscricaoEm} forma={r.avisoTranscricaoForma} por={porT} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="processar" value="1" /> gerar a ata com IA depois de salvar</label>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Salvar gravação e transcrição</Button>
          <LinkButton href={`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}`}>Cancelar</LinkButton>
          <span className="text-xs text-[var(--muted)]">Pode salvar só a gravação, só a transcrição ou as duas; a ciência dos participantes é obrigatória para o que for salvo.</span>
        </div>
      </form>
    </div>
  );
}
