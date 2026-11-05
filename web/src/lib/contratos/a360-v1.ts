/**
 * Contrato de dados do Architecture 360 para consumidores externos (Rucelle 360°) — versão 1.
 *
 * Princípios (prompt de 05/11/2026, seção 6):
 *  - Toda informação carrega origem, data de referência e natureza:
 *      "original"      → fato importado do Vobi (ou recebido do People), sem transformação de significado;
 *      "calculado"     → indicador derivado pelo A360 a partir dos dados originais (regra determinística);
 *      "inferencia_ia" → leitura produzida por IA (hoje não existe nenhuma; o campo fica reservado).
 *  - Identificadores estáveis: projeto = Código do Vobi; pessoa = e-mail @rucelle; carga = id sequencial do A360.
 *  - Nada aqui identifica desempenho individual: só agregados da operação, cobertura e limitações.
 *  - Mudanças incompatíveis geram "versao" nova; campos podem ser adicionados sem quebrar a v1.
 */
export type Natureza = "original" | "calculado" | "inferencia_ia";

export type Proveniencia = {
  origem: "vobi" | "people" | "a360";
  natureza: Natureza;
  /** Data da exportação do Vobi (atualidade do dado), ISO yyyy-mm-dd. */
  dataReferencia: string;
  cargaId: number;
};

export type Cobertura = { base: number; total: number; descricao: string };

export type Indicador = {
  chave: string;
  rotulo: string;
  valor: number;
  unidade: "tarefas" | "projetos" | "horas" | "percentual";
  proveniencia: Proveniencia;
  cobertura?: Cobertura;
};

export type Distribuicao = { chave: string; rotulo: string; proveniencia: Proveniencia; itens: { rotulo: string; valor: number; codigo?: number }[] };

export type RecomendacaoExport = { tema: string; sinal: string; leitura: string; cuidado: string; natureza: "calculado" };

export type Limitacao = { chave: string; descricao: string };

export type PanoramaOperacaoV1 = {
  versao: "a360.operacao.v1";
  geradoEm: string;
  sistema: "architecture-360";
  carga: { id: number; dataExportacaoVobi: string } | null;
  indicadores: Indicador[];
  distribuicoes: Distribuicao[];
  recomendacoes: RecomendacaoExport[];
  limitacoes: Limitacao[];
  qualidade: { classes: { classe: string; tarefas: number; entraEm: string }[]; proveniencia: Proveniencia } | null;
  organizacao: { fonte: "people"; sincronizadoEm: string | null; pessoas: number; status: "ok" | "ausente" };
};
