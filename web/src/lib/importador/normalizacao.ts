// Normalização — seção 1.4 da especificação v2.0. Porte direto da PoC (importador/importador.py).

export const LAYOUT_PROJETOS_V1 = [
  "Código", "Nome", "cliente (nome)", "Status", "Criado em", "Data de ganho", "Valor estimado",
  "Valor de ganho", "Metragem", "Expectativa de início", "Descrição", "CEP", "Endereço", "Numero",
  "Complemento", "Cidade", "Estado", "Colaboradores", "Origem", "Empresa", "Etiqueta",
];
export const LAYOUT_TAREFAS_V1 = [
  "Nome da tarefa", "Etapa", "Projeto", "Data de Início", "Data de Fim", "Descrição", "Horas estimadas",
  "Responsável", "Horas realizadas (em minutos)", "prioridade", "Status",
];

// Clientes (Cadastros › Contatos › Clientes › Ações › Exportar CSV) — layout completo do Vobi, só para validar o cabeçalho.
export const LAYOUT_CLIENTES_V1 = [
  "Código", "Nome", "Razão Social", "Email", "CPF/CNPJ", "RG/IE", "Data de nascimento", "Telefone", "Status",
  "Criado em", "Observações", "CEP", "Rua", "Número", "Complemento", "Bairro", "Cidade", "Estado", "Tipo",
];
// Colunas que o A360 pode guardar. CPF/CNPJ, RG/IE, Data de nascimento, Observações e endereço (CEP, Rua, Número,
// Complemento, Bairro) nunca entram — nem na área bruta, nem no conteúdo temporário da prévia.
export const LAYOUT_CLIENTES_A360 = ["Código", "Nome", "Razão Social", "Email", "Telefone", "Status", "Criado em", "Cidade", "Estado", "Tipo"];

// Parâmetros ajustáveis pela gestão (seção 4.2)
export const LIMIAR_NAO_ENCONTRADOS = 0.15;
export const LIMIAR_LINHAS_MINIMAS = 0.7;
export const IDADE_MAXIMA_CARGA_DIAS = 8;

// Recorte da base (decisão do Rodrigo, 10/11/2026): o A360 trabalha só com projetos em andamento/pausados
// e com os encerrados (Finalizado/Cancelado) criados a partir de 2026. Encerrados anteriores são arquivados
// uma única vez pela migração 0010 (tabelas projeto_arquivado/tarefa_arquivada), nunca apagados; a importação só
// deixa de trazê-los de volta. Projeto que já está na base ativa nunca sai pela importação. A exportação do Vobi continua completa.
export const RECORTE_INICIO = "2026-01-01";
export const foraDoRecorte = (statusClasse: string, criadoEmIso: string | null) =>
  statusClasse === "encerrado" && (!criadoEmIso || criadoEmIso < RECORTE_INICIO);

export const STATUS_PROJETO_CLASSE: Record<string, string> = {
  finalizado: "encerrado",
  cancelado: "encerrado",
  pausado: "pausado",
};

// chave normalizada → etapa canônica
export const ETAPAS_CANONICAS: Record<string, string> = {
  "refacao": "Refação",
  "conceito e layout": "Conceito e Layout",
  "conceito & layout": "Conceito e Layout",
  "conceito/layout": "Conceito e Layout",
  "layout & conceito": "Conceito e Layout",
  "imagens 3d": "Imagens 3D",
  "projeto executivo civil": "Projeto Executivo Civil",
  "executivo obra civil": "Projeto Executivo Civil",
  "projeto de detalhamento de interiores": "Detalhamento de Interiores",
  "detalhamento de interiores": "Detalhamento de Interiores",
  "pn": "Programa de Necessidades",
  "programa de necessidades": "Programa de Necessidades",
  "documentacao": "Documentação",
  "projeto legal": "Projeto Legal",
  "caderno consultoria": "Caderno Consultoria",
  "geral": "Geral",
};

// Semente nome → e-mail (tela Equipe do Vobi, 04/11/2026) + titular da conta
export const PESSOAS_SEMENTE: Record<string, string> = {
  "Marília Reck Tegner": "marilia.tegner@rucelle.com.br",
  "Pietra Consoli Di Nizo": "pietra.consoli@rucelle.com.br",
  "Andressa Ferreira": "andressa.ferreira@rucelle.com.br",
  "Ana Batitucci": "ana.batitucci@rucelle.com.br",
  "Maiara Bernardi Mascarenhas": "maiara.bernardi@rucelle.com.br",
  "Amanda Monteiro": "amanda.monteiro@rucelle.com.br",
  "Giovanna Cortez": "giovanna.machado@rucelle.com.br",
  "Tatiana Barra": "financeiro@flaviarucelle.com",
  "Ana Paula Zambetti": "anapaula.zambetti@rucelle.com.br",
  "Luryan Nunes": "luryan.nunes@rucelle.com.br",
  "Isys Monteiro": "isys.monteiro@rucelle.com.br",
  "Thais Valle": "thais.valle@rucelle.com.br",
  "Rodrigo Carneiro": "rodrigo.carneiro@rucelle.com.br",
};

export function semAcentos(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Comparação sem acentos, sem caixa, sem espaços duplicados. */
export function chaveTexto(s: string | null | undefined): string {
  return semAcentos(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function limpar(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

export function etapaCanonica(etapa: string): { etapa: string; conhecida: boolean } {
  let k = chaveTexto(etapa);
  k = k.replace(/^\d{2}\s*:\s*/, ""); // prefixo numérico de template: "04: ..."
  k = k.replace(/\s*\/\s*/g, "/");
  if (k in ETAPAS_CANONICAS) return { etapa: ETAPAS_CANONICAS[k], conhecida: true };
  return { etapa: limpar(etapa) || "(vazia)", conhecida: false };
}

export function extrairRevisao(nome: string): number | null {
  const m = /\bR(\d{2})\b/i.exec(nome ?? "");
  return m ? parseInt(m[1], 10) : null;
}

/** dd/mm/aaaa → AAAA-MM-DD; vazio/inválido → null */
export function dataIso(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
  return `${y}-${mo}-${d}`;
}

/** 'h:mm' → minutos; inteiro puro → minutos (aviso); vazio → null */
export function horasParaMinutos(s: string | null | undefined): { minutos: number | null; aviso: string | null } {
  const v = (s ?? "").trim();
  if (!v) return { minutos: null, aviso: null };
  let m = /^(\d+):(\d{2})$/.exec(v);
  if (m) return { minutos: parseInt(m[1], 10) * 60 + parseInt(m[2], 10), aviso: null };
  m = /^\d+$/.exec(v);
  if (m) return { minutos: parseInt(v, 10), aviso: "horas_em_inteiro" };
  return { minutos: null, aviso: `horas_formato_desconhecido:${v}` };
}

export function listaVirgula(s: string | null | undefined): string[] {
  return (s ?? "").split(",").map(limpar).filter(Boolean);
}

export function metragemNum(s: string | null | undefined): number | null {
  const v = (s ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function minutosParaHoras(min: number | null | undefined): string {
  if (min == null) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Similaridade simples de texto (0–1), usada na sugestão de renomeação. */
export function similaridade(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  // razão de bigramas em comum (Dice) — suficiente para a sugestão um-para-um
  const grams = (s: string) => {
    const g = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const k = s.slice(i, i + 2);
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return g;
  };
  const ga = grams(a), gb = grams(b);
  let inter = 0;
  for (const [k, n] of ga) inter += Math.min(n, gb.get(k) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}
