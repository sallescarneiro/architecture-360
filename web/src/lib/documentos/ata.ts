// Exportação da ata de reunião (.docx), com papel timbrado opcional (decisão de 12/11/2026).
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { fmtPeriodo, itensDe, STATUS_REUNIAO, TIPOS_ITEM, type Reuniao } from "@/lib/reunioes";
import { gerarDocx, type Bloco } from "./docx";

const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export async function docxDaAta(r: Reuniao, timbrado: boolean): Promise<Buffer> {
  const itens = (await itensDe(r.id)).filter((i) => i.confirmado);
  const projeto = r.projetoCodigo ? (await db.select({ nome: schema.projetos.nome }).from(schema.projetos).where(eq(schema.projetos.codigo, r.projetoCodigo)).limit(1))[0] : null;
  const cliente = r.clienteCodigo ? (await db.select({ nome: schema.clientesVobi.nome }).from(schema.clientesVobi).where(eq(schema.clientesVobi.codigo, r.clienteCodigo)).limit(1))[0] : null;
  const b: Bloco[] = [
    { tipo: "titulo", texto: `Ata de reunião — ${r.titulo}` },
    { tipo: "subtitulo", texto: [fmtPeriodo(r.inicio, r.fim), r.local, STATUS_REUNIAO[r.status]?.rotulo].filter(Boolean).join(" · ") },
  ];
  if (projeto || cliente) b.push({ tipo: "paragrafo", texto: [projeto ? `Projeto: ${projeto.nome}` : "", cliente ? `Cliente: ${cliente.nome}` : ""].filter(Boolean).join("\n") });
  if (r.participantes.length) { b.push({ tipo: "secao", texto: "Participantes" }); for (const p of r.participantes) b.push({ tipo: "item", texto: `${p.nome}${p.externo ? " (externo)" : ""}` }); }
  if (r.pauta?.trim()) { b.push({ tipo: "secao", texto: "Pauta" }); b.push({ tipo: "paragrafo", texto: r.pauta.trim() }); }
  if (r.ata?.trim()) { b.push({ tipo: "secao", texto: "Ata" }); for (const p of r.ata.trim().split(/\n{2,}/)) b.push({ tipo: "paragrafo", texto: p }); }
  for (const tipo of Object.keys(TIPOS_ITEM)) {
    const lst = itens.filter((i) => i.tipo === tipo && i.situacao !== "cancelado");
    if (!lst.length) continue;
    b.push({ tipo: "secao", texto: TIPOS_ITEM[tipo].plural });
    for (const i of lst) {
      const extra = tipo === "encaminhamento" ? [i.responsavel ? `responsável: ${i.responsavel}` : "", i.prazo ? `prazo: ${dia(i.prazo)}` : "", i.situacao === "feito" ? "feito" : ""].filter(Boolean).join(" · ") : "";
      b.push({ tipo: "item", texto: extra ? `${i.texto} (${extra})` : i.texto });
    }
  }
  b.push({ tipo: "paragrafo", pequeno: true, texto: `Documento gerado pelo Architecture 360 em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Itens não confirmados não entram na ata exportada.` });
  return gerarDocx(b, { timbrado, titulo: `Ata — ${r.titulo}` });
}
