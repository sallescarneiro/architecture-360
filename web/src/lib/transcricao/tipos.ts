// Estrutura da ata gerada a partir da transcrição (T-188 evolução, item 2.2). Cada item carrega a confiabilidade (2.3).
export type Confianca = "mencionado" | "sintese" | "inferencia" | "confirmar" | "nao_identificado";
export type ItemAta = { texto: string; confianca: Confianca; trecho?: string | null; tempo?: string | null; responsavel?: string | null; prazo?: string | null };
export type AtaEstruturada = {
  resumo: string;
  participantes: { nome: string; confianca: Confianca }[];
  assuntos: ItemAta[];
  problemas: ItemAta[];
  decisoes: ItemAta[];
  aprovacoes: ItemAta[];
  encaminhamentos: ItemAta[];
  pendencias: ItemAta[];
  duvidas: ItemAta[];
  divergencias: ItemAta[];
  relacoesAnteriores: ItemAta[];
  naoIdentificado: string[];      // o que a IA procurou e não encontrou (ex.: prazos, responsáveis)
  observacoes?: string | null;
};
export const CONFIANCA: Record<Confianca, { rotulo: string; descricao: string }> = {
  mencionado: { rotulo: "mencionado", descricao: "dito expressamente na transcrição" },
  sintese: { rotulo: "síntese", descricao: "resumo feito pela IA a partir de vários trechos" },
  inferencia: { rotulo: "inferência", descricao: "interpretação da IA; não foi dito com essas palavras" },
  confirmar: { rotulo: "confirmar", descricao: "precisa de confirmação humana" },
  nao_identificado: { rotulo: "não identificado", descricao: "não encontrado na transcrição" },
};
