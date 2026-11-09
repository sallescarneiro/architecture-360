// Inventário de cobertura da integração Vobi (T-188 evolução, item 5.4). Fonte: layouts das exportações CSV efetivamente
// importadas (src/lib/importador/normalizacao.ts) e tabelas espelho. Nada aqui é suposição sobre a API do Vobi: a integração
// atual é por exportação manual de CSV (Projetos, Tarefas, Clientes), somente leitura, sem API.

export type Campo = { campo: string; origem: "Projetos" | "Tarefas" | "Clientes" | "derivado"; uso: string };

/** O que o A360 recebe hoje (campos autorizados das exportações). */
export const RECEBIDOS: Campo[] = [
  { campo: "Projeto: código, nome, cliente (nome), status, criado em, metragem, etiquetas, colaboradores", origem: "Projetos", uso: "carteira, situação, participação por pessoa, vínculo com cliente" },
  { campo: "Tarefa: projeto, etapa, nome, revisão (R01…), status, prioridade, início, fim, horas estimadas/realizadas, responsável", origem: "Tarefas", uso: "prazos, atrasos, gargalos, entregas, refação (contagem), carga por responsável" },
  { campo: "Cliente: código, nome, razão social, e-mail, telefone, status, criado em, cidade, estado, tipo", origem: "Clientes", uso: "ficha do cliente, vínculo projeto↔cliente" },
  { campo: "Histórico entre cargas: campo alterado, valor anterior e novo, data da carga", origem: "derivado", uso: "linha do tempo (mudanças de status, prazos, responsáveis, revisões) — granularidade = datas das exportações" },
];

/** O que o A360 consegue comparar com os dados atuais. */
export const COMPARAVEIS = [
  "Decisões/aprovações registradas no A360 × etapas e tarefas abertas/concluídas no Vobi (existe tarefa da etapa seguinte? está atrasada?)",
  "Encaminhamentos do A360 com prazo × tarefas do Vobi do mesmo projeto no mesmo período (indício de execução, não confirmação)",
  "Reuniões do A360 × revisões (R01+) e tarefas de Refação no Vobi (refação após aprovação registrada)",
  "Sequência temporal: reunião/aprovação no A360 antes ou depois de mudanças de status/prazo no Vobi (via histórico entre cargas)",
  "Decisões internas × aprovações do cliente registradas no A360 (contradição entre reuniões) — só A360",
];

export type Lacuna = { chave: string; dado: string; necessarioPara: string; tipo: "disponibilidade" | "integracao" | "permissao" | "formato" | "ausencia_registro"; alternativa: string | null };

/** O que o A360 NÃO recebe e seria necessário para comparar apresentação, aprovação e produção. */
export const LACUNAS: Lacuna[] = [
  { chave: "vobi.apresentacoes", dado: "Reuniões de apresentação ao cliente e suas atas (Vobi)", necessarioPara: "comparar o que foi apresentado ao cliente com o que foi decidido internamente", tipo: "disponibilidade", alternativa: "registrar a apresentação como reunião no A360 com a transcrição/ata (origem A360)" },
  { chave: "vobi.aprovacoes", dado: "Aprovações do cliente registradas no Vobi (data, item aprovado, condições)", necessarioPara: "confirmar a aprovação na fonte oficial e comparar com a produção", tipo: "disponibilidade", alternativa: "aprovações registradas no A360 (reunião → Aprovações) até a Vobi exportar esse dado" },
  { chave: "vobi.solicitacoes", dado: "Solicitações de alteração do cliente (Vobi)", necessarioPara: "distinguir divergência de alteração solicitada e aprovada", tipo: "disponibilidade", alternativa: "registrar a solicitação como decisão/encaminhamento em reunião do A360" },
  { chave: "vobi.comentarios", dado: "Comentários e histórico de atividades das tarefas (Vobi)", necessarioPara: "rastrear quando e por que uma tarefa mudou", tipo: "disponibilidade", alternativa: "histórico entre cargas (só mostra o que mudou entre duas exportações)" },
  { chave: "vobi.especificacoes", dado: "Especificação efetivamente usada na produção (materiais, equipamentos, dimensões, quantitativos, layout)", necessarioPara: "comparar produção com o que o cliente aprovou", tipo: "ausencia_registro", alternativa: "nenhuma na integração atual; depende de a produção registrar a especificação em sistema acessível" },
  { chave: "vobi.arquivos", dado: "Arquivos e versões de desenhos/cadernos entregues", necessarioPara: "comparar versões entregues com aprovações", tipo: "disponibilidade", alternativa: "não há; fora do escopo da exportação CSV" },
  { chave: "vobi.datas_reais", dado: "Datas reais de conclusão das tarefas (só há prazo planejado e status)", necessarioPara: "medir quando algo foi de fato produzido", tipo: "formato", alternativa: "data da carga em que o status passou a concluído (aproximação, via histórico entre cargas)" },
  { chave: "vobi.id_tarefa", dado: "Identificador estável da tarefa (a chave atual é projeto|etapa|nome|ocorrência)", necessarioPara: "seguir uma tarefa renomeada entre cargas", tipo: "formato", alternativa: "chave composta; renomeações aparecem como remoção + inclusão" },
  { chave: "vobi.api", dado: "API do Vobi (leitura automática)", necessarioPara: "atualização contínua sem exportação manual", tipo: "integracao", alternativa: "exportações CSV 2× por semana (cadência combinada); perguntas sobre API enviadas à Vobi aguardam decisão (D-06 no Painel Mestre)" },
];

/** Limitações do próprio A360 (configuração), também representadas como flags. */
export const LACUNAS_A360 = {
  ia: { chave: "a360.ia", dado: "Chave da API de IA (ANTHROPIC_API_KEY) no Railway", necessarioPara: "gerar atas automáticas e analisar divergências; sem ela, a extração é por regras e marcada como 'precisa de confirmação'", tipo: "integracao" as const, alternativa: "extração por regras (limitada) até a chave ser configurada" },
};

export const iaConfigurada = () => Boolean(process.env.ANTHROPIC_API_KEY);
