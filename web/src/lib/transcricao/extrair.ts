// Extração de texto das transcrições (T-188 evolução, item 2.1). O Google Meet salva a transcrição como Documento Google na
// pasta "Meet Recordings" do Drive (exportável em .docx, .txt, .pdf), e as legendas podem vir como .vtt/.srt de gravações.
// Suportados: .txt, .md, .docx, .pdf, .vtt, .srt. O conteúdo original é guardado intacto; aqui só se extrai texto para leitura e IA.
import mammoth from "mammoth";

export type Formato = "txt" | "md" | "docx" | "pdf" | "vtt" | "srt" | "desconhecido";
export const FORMATOS_ACEITOS = [".txt", ".md", ".docx", ".pdf", ".vtt", ".srt"];
export const TAMANHO_MAX = 15 * 1024 * 1024;

export function formatoDe(nome: string, mime: string): Formato {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "txt") return "txt"; if (ext === "md") return "md"; if (ext === "docx") return "docx"; if (ext === "pdf") return "pdf"; if (ext === "vtt") return "vtt"; if (ext === "srt") return "srt";
  if (mime.includes("wordprocessingml")) return "docx"; if (mime === "application/pdf") return "pdf"; if (mime.startsWith("text/")) return "txt";
  return "desconhecido";
}

export async function extrairTexto(buf: Buffer, formato: Formato): Promise<string> {
  if (formato === "txt" || formato === "md") return buf.toString("utf8");
  if (formato === "vtt" || formato === "srt") return legendasParaTexto(buf.toString("utf8"));
  if (formato === "docx") { const r = await mammoth.extractRawText({ buffer: buf }); return r.value; }
  if (formato === "pdf") { const pdf = (await import("pdf-parse")).default as unknown as (b: Buffer) => Promise<{ text: string }>; const r = await pdf(buf); return r.text; }
  throw new Error("formato não suportado");
}

/** Converte WebVTT/SRT em linhas "[hh:mm:ss] fala", preservando a marcação de tempo. */
function legendasParaTexto(s: string): string {
  const linhas = s.replace(/\r/g, "").split("\n"); const out: string[] = []; let tempo: string | null = null;
  for (const l of linhas) {
    const m = /^(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3})\s+-->/.exec(l.trim());
    if (m) { tempo = m[1].replace(",", ".").split(".")[0]; continue; }
    if (!l.trim() || /^\d+$/.test(l.trim()) || l.startsWith("WEBVTT") || l.startsWith("NOTE")) continue;
    const texto = l.replace(/<[^>]+>/g, "").trim();
    if (texto) out.push(tempo ? `[${tempo}] ${texto}` : texto);
  }
  return out.join("\n");
}

/** Normaliza a transcrição em falas: tenta reconhecer "Nome: fala" e marcações de tempo (formatos do Meet e de legendas). */
export type Fala = { tempo: string | null; quem: string | null; texto: string; linha: number };
export function falas(texto: string): Fala[] {
  const out: Fala[] = []; let tempo: string | null = null; let quem: string | null = null;
  texto.replace(/\r/g, "").split("\n").forEach((l, i) => {
    const t = l.trim(); if (!t) return;
    const mt = /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/.exec(t);
    let resto = t; if (mt) { tempo = mt[1]; resto = mt[2]; if (!resto) return; }
    const mq = /^([A-ZÀ-Üa-zà-ü][\wÀ-ü .'-]{1,60}?):\s+(.+)$/.exec(resto);
    if (mq) { quem = mq[1].trim(); resto = mq[2]; }
    out.push({ tempo, quem, texto: resto, linha: i + 1 });
  });
  return out;
}
