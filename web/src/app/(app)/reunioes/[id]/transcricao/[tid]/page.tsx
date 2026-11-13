import { notFound, redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth";
import { podeVer, reuniaoPorId } from "@/lib/reunioes";
import { arquivoDe } from "@/lib/transcricao/processar";
import { falas } from "@/lib/transcricao/extrair";
import { dataHora } from "@/lib/agenda/datas";
import { Button, LinkButton, PageHeader } from "@/components/ui";

const seguro = (s?: string) => (s && s.startsWith("/") && !s.startsWith("//") ? s : "/reunioes");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const seg = (t: string) => { const p = t.split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

/** Destaca as ocorrências do termo buscado (sem HTML: devolve pedaços). */
function realce(texto: string, q: string) {
  if (!q) return [texto];
  const n = norm(texto), k = norm(q), out: (string | { m: string })[] = [];
  let i = 0, j: number;
  while ((j = n.indexOf(k, i)) >= 0) { out.push(texto.slice(i, j), { m: texto.slice(j, j + q.length) }); i = j + q.length; }
  out.push(texto.slice(i));
  return out;
}

/** T-227 — Leitor da transcrição: texto integral como recebido, falas com horário, busca e abertura da gravação no ponto. */
export default async function LeitorPage({ params, searchParams }: { params: Promise<{ id: string; tid: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirUsuario();
  const { id, tid } = await params; const sp = await searchParams; const volta = seguro(sp.volta);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(tid)) notFound();
  const r = await reuniaoPorId(Number(id)); if (!r) notFound();
  if (!(await podeVer(u, r))) redirect("/sem-permissao");
  const t = await arquivoDe(Number(tid));
  if (!t || t.reuniaoId !== r.id) notFound();
  const todas = falas(t.texto ?? "");
  const q = (sp.q ?? "").trim().slice(0, 60);
  const ir = /^\d{1,2}:\d{2}(:\d{2})?$/.test(sp.t ?? "") ? sp.t! : "";
  const comTempo = todas.filter((f) => f.tempo).length;
  const ocorr = q ? todas.filter((f) => norm(`${f.quem ?? ""} ${f.texto}`).includes(norm(q))) : [];
  // ponto alvo: horário pedido ou primeira ocorrência
  const alvo = ir ? todas.find((f) => f.tempo && seg(f.tempo) >= seg(ir)) ?? null : ocorr[0] ?? null;
  const ultimo = [...todas].reverse().find((f) => f.tempo)?.tempo ?? null;
  const base = `/reunioes/${r.id}/transcricao/${t.id}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader eyebrow={`${r.titulo} · transcrição v${t.versao}`} title="Leitor da transcrição"
        subtitle="Texto integral como foi recebido, sem edição. Use o horário para abrir a gravação no ponto aproximado."
        actions={<LinkButton href={`/reunioes/${r.id}?volta=${encodeURIComponent(volta)}#transcricao`}>← Voltar à reunião</LinkButton>} />
      <div className="flex flex-wrap items-start gap-4">
        <section className="card flex min-w-0 flex-[999_1_560px] flex-col gap-3 p-4" aria-label="Falas">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="volta" value={volta} />
            <label className="block min-w-[14rem] flex-1 text-xs font-semibold text-[var(--txt-2)]">Buscar no texto<input name="q" defaultValue={q} className="input mt-1" /></label>
            <label className="block w-40 text-xs font-semibold text-[var(--txt-2)]">Ir para o horário<input name="t" defaultValue={ir} placeholder="00:12:30" className="input mt-1" /></label>
            <Button variant="secondary" className="btn-sm">Ir</Button>
          </form>
          <p className="text-xs text-[var(--muted)]">{todas.length} falas · {comTempo} com horário{ultimo ? ` (até ${ultimo})` : ""}{q ? ` · ${ocorr.length} ocorrência(s) de “${q}”` : ""}</p>
          <ol className="flex flex-col">
            {todas.map((f) => {
              const foco = alvo === f, achou = q && ocorr.includes(f);
              return (
                <li key={f.linha} id={`l${f.linha}`} className={`grid grid-cols-[5.5rem_1fr] gap-x-3 border-b border-[var(--line)] px-1 py-2 ${foco ? "rounded-[10px] bg-[var(--surface-2)] ring-1 ring-[var(--line)]" : ""}`}>
                  {f.tempo ? <a className="font-mono text-[0.8rem] font-semibold text-[var(--vinho)] no-underline" href={`${base}?t=${f.tempo}&volta=${encodeURIComponent(volta)}#l${f.linha}`}>{f.tempo}</a> : <span className="text-xs text-[var(--muted)]">—</span>}
                  <div className="min-w-0">
                    {f.quem && <div className="text-xs font-bold text-[var(--txt-2)]">{f.quem}</div>}
                    <p className="m-0 text-sm leading-relaxed">{achou ? realce(f.texto, q).map((p, i) => typeof p === "string" ? p : <mark key={i} className="rounded bg-[var(--rose-2)] px-0.5">{p.m}</mark>) : f.texto}</p>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-[var(--muted)]">Quem fala só aparece quando a transcrição indica; o A360 não atribui falas por conta própria.</p>
        </section>
        <aside className="card flex min-w-0 max-w-sm flex-[1_1_280px] flex-col gap-3 p-4" aria-label="Sobre a transcrição">
          <h2 className="text-[0.95rem] font-semibold">Gravação e origem</h2>
          {r.gravacaoUrl ? <>
            <a className="btn btn-primary" href={`/api/reunioes/gravacao?id=${r.id}${alvo?.tempo ? `&t=${alvo.tempo}` : ""}`} target="_blank" rel="noreferrer">Abrir gravação{alvo?.tempo ? ` em ${alvo.tempo}` : ""}</a>
            <p className="rounded-[10px] bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn)]">A plataforma pode não abrir exatamente no minuto. Se abrir no começo, avance até o horário indicado.</p>
          </> : <p className="text-sm text-[var(--muted)]">Sem link de gravação registrado.</p>}
          <dl className="flex flex-col gap-1 text-sm">
            <dt className="mt-1 text-xs font-semibold text-[var(--muted)]">Origem</dt><dd className="m-0">{t.entrada === "colado" ? "texto colado" : t.nomeArquivo}{t.linkOriginal ? <> · <a className="underline" href={t.linkOriginal} target="_blank" rel="noreferrer">original no Drive</a></> : ""}</dd>
            <dt className="mt-1 text-xs font-semibold text-[var(--muted)]">Texto guardado</dt><dd className="m-0">{Math.max(1, Math.round(Buffer.byteLength(t.texto ?? "") / 1024))} KB · enviado em {dataHora(t.enviadoEm)}</dd>
            {t.hash && <><dt className="mt-1 text-xs font-semibold text-[var(--muted)]">Impressão digital (sha-256)</dt><dd className="m-0 break-all font-mono text-xs">{t.hash}</dd></>}
          </dl>
        </aside>
      </div>
    </div>
  );
}
