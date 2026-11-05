# PoC do importador — resultado (05/11/2026)

Entrada: Projetos (572 linhas) e Tarefas (1.461 linhas) exportados do Vobi em 04/11/2026 (carga 1);
cópia das tarefas com 5 alterações plantadas (carga 2). Banco SQLite local. Sem alteração no Vobi.

| # | Critério | Resultado |
|---|----------|-----------|
| 1 | Carga 1 importa 572 projetos e 1.461 tarefas, contagens por status iguais à análise | OK — Finalizado 480, Cancelado 22, ativos 70; tarefas planejado 984 / concluído 462 / em andamento 10 / cancelado 5 |
| 2 | 1 tarefa órfã e 3 colisões detectadas | OK — órfã: linha sem projeto (concluída, Amanda Monteiro); colisões: 2× etapa Geral sem nome, 1× "refação layout" |
| 3 | Recarga idêntica ignorada; forçada → 0 novos / 0 alterados / 0 não encontrados | OK |
| 4 | 5 alterações plantadas: 3 alteradas (status, data fim, responsável), 1 renomeada → não encontrada + nova com sugestão, 1 removida → não encontrada | OK — sugestão de renomeação com similaridade 0,81; a removida não recebeu sugestão |
| 5 | Cabeçalho alterado recusado sem gravar | OK — carga marcada "recusada" |
| 6 | Arquivo com 50% das linhas retido como anômalo | OK — "não encontrados 50% > 15%" |
| 7 | Erro no meio da carga deixa a base como antes | OK — contagens e última carga inalteradas após falha simulada na linha 700 |

Correções feitas durante a rodada (uma repetição cada): taxa de "não encontrados" calculada sobre as linhas da carga anterior;
sugestão de renomeação um-para-um com similaridade de nome ≥ 0,6.

Qualidade na carga 1: completa 288 · sem responsável 962 · sem início 123 · sem prazo 82 · encerrada 5 · órfã 1.
Etapas ainda "a classificar" (17 tarefas): ESTUDO VOLUMÉTRICO, Reunião apresentação, VÍDEO, Refação 3D, ENTREGA PROJETO COMPLETO.
