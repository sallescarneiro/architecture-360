// Classificação e associação dos eventos da Agenda (T-187 Etapa 2). Regras simples e declaradas; nada é escrito no Vobi.
export type TipoEvento = "cliente" | "interna" | "visita" | "outro" | "ocupado";

export const TIPOS: Record<TipoEvento, { rotulo: string; tom: string; descricao: string }> = {
  cliente: { rotulo: "cliente", tom: "var(--vinho)", descricao: "há participante de fora da Rucelle" },
  interna: { rotulo: "interna", tom: "var(--st-ok)", descricao: "só participantes @rucelle.com.br" },
  visita: { rotulo: "visita", tom: "var(--st-breve)", descricao: "título menciona visita/obra/medição" },
  outro: { rotulo: "outro", tom: "var(--muted)", descricao: "sem participantes e sem pista no título" },
  ocupado: { rotulo: "ocupado", tom: "var(--line-2)", descricao: "evento privado — só o horário" },
};

export function classificar(args: { privado: boolean; titulo: string | null; local: string | null; externos: number; participantes: number }): TipoEvento {
  if (args.privado) return "ocupado";
  const t = `${args.titulo ?? ""} ${args.local ?? ""}`.toLowerCase();
  if (/\bvisita|\bobra\b|medi[çc][ãa]o|vistoria|levantamento/.test(t)) return "visita";
  if (args.externos > 0) return "cliente";
  if (args.participantes > 0) return "interna";
  return "outro";
}

export type ProjetoRef = { codigo: number; nome: string; cliente: string | null };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Sugere o projeto do Vobi a partir do título/descrição (decisão D4): código entre colchetes ou no texto, senão nome do
 * projeto ou do cliente contido no título. Devolve null quando não há pista ou há ambiguidade — a coordenação decide.
 */
export function sugerirProjeto(titulo: string | null, descricao: string | null, projetos: ProjetoRef[]): number | null {
  const texto = `${titulo ?? ""} ${descricao ?? ""}`;
  const porCodigo = [...texto.matchAll(/\[(\d{4,7})\]|#(\d{4,7})|\b(\d{5,7})\b/g)].map((m) => Number(m[1] ?? m[2] ?? m[3]));
  const codigos = new Set(projetos.map((p) => p.codigo));
  const achados = [...new Set(porCodigo.filter((c) => codigos.has(c)))];
  if (achados.length === 1) return achados[0];
  if (achados.length > 1) return null;
  const nt = norm(texto);
  if (nt.length < 4) return null;
  const porNome = projetos.filter((p) => { const n = norm(p.nome); return n.length >= 5 && nt.includes(n); });
  if (porNome.length === 1) return porNome[0].codigo;
  if (porNome.length > 1) return null;
  const porCliente = projetos.filter((p) => { const c = p.cliente ? norm(p.cliente) : ""; return c.length >= 5 && nt.includes(c); });
  return porCliente.length === 1 ? porCliente[0].codigo : null;
}
