// Documentos .docx do A360 a partir do modelo institucional da rucelle (papel timbrado enviado por Rodrigo, 12/11/2026).
// O timbrado é OPCIONAL em cada exportação (decisão de 12/11/2026): sem ele, o mesmo documento sai sem cabeçalho/rodapé.
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

export const MODELO_TIMBRADO = path.join(process.cwd(), "modelos", "rucelle-papel-timbrado.docx");
export const NOME_MODELO_TIMBRADO = "rucelle-papel-timbrado.docx";

export type Bloco =
  | { tipo: "titulo"; texto: string }
  | { tipo: "subtitulo"; texto: string }
  | { tipo: "secao"; texto: string }
  | { tipo: "paragrafo"; texto: string; negrito?: boolean; pequeno?: boolean }
  | { tipo: "item"; texto: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const run = (texto: string, rpr = "") =>
  texto.split("\n").map((l, i) => `${i ? "<w:r><w:br/></w:r>" : ""}<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join("");
const par = (texto: string, ppr: string, rpr = "") => `<w:p><w:pPr>${ppr}</w:pPr>${run(texto, rpr)}</w:p>`;

function xmlBloco(b: Bloco): string {
  switch (b.tipo) {
    case "titulo": return par(b.texto, `<w:spacing w:after="120"/>`, `<w:b/><w:color w:val="1f1f1f"/><w:sz w:val="32"/>`);
    case "subtitulo": return par(b.texto, `<w:spacing w:after="240"/>`, `<w:color w:val="6b6b6b"/><w:sz w:val="20"/>`);
    case "secao": return par(b.texto, `<w:keepNext/><w:spacing w:before="280" w:after="100"/>`, `<w:b/><w:color w:val="e35336"/><w:sz w:val="24"/>`);
    case "item": return par(`•  ${b.texto}`, `<w:spacing w:after="80"/><w:ind w:left="284" w:hanging="284"/>`);
    default: return par(b.texto, `<w:spacing w:after="120"/>`, `${b.negrito ? "<w:b/>" : ""}${b.pequeno ? `<w:color w:val="6b6b6b"/><w:sz w:val="18"/>` : ""}`);
  }
}

/** Gera o .docx: corpo com os blocos; com ou sem o papel timbrado (cabeçalho e rodapé do modelo). */
export async function gerarDocx(blocos: Bloco[], opts: { timbrado: boolean; titulo?: string }): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await readFile(MODELO_TIMBRADO));
  const doc = await zip.file("word/document.xml")!.async("string");
  const ini = doc.indexOf("<w:body>") + "<w:body>".length;
  const sect = doc.indexOf("<w:sectPr");
  let sectPr = doc.slice(sect, doc.indexOf("</w:body>"));
  if (!opts.timbrado) {
    // sem timbrado: tira cabeçalho/rodapé e usa margem superior comum (o timbrado reserva espaço para o logo)
    sectPr = sectPr.replace(/<w:headerReference[^>]*\/>/g, "").replace(/<w:footerReference[^>]*\/>/g, "").replace(/w:top="\d+"/, 'w:top="1417"').replace(/w:bottom="\d+"/, 'w:bottom="1417"');
  }
  zip.file("word/document.xml", doc.slice(0, ini) + blocos.map(xmlBloco).join("") + sectPr + "</w:body></w:document>");
  if (opts.titulo) {
    const core = zip.file("docProps/core.xml");
    if (core) {
      const c = await core.async("string");
      zip.file("docProps/core.xml", /<dc:title>/.test(c) ? c.replace(/<dc:title>[\s\S]*?<\/dc:title>/, `<dc:title>${esc(opts.titulo)}</dc:title>`) : c);
    }
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export const nomeArquivo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "documento";
