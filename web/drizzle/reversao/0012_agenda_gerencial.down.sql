-- Reversão da 0012 (T-219, Agenda gerencial). Remove atividades, histórico, fila de envio e espelhos do Vobi.
DROP TABLE IF EXISTS "vobi_envio";
DROP TABLE IF EXISTS "atividade_historico";
DROP TABLE IF EXISTS "atividade";
DROP TABLE IF EXISTS "vobi_tarefa";
DROP TABLE IF EXISTS "vobi_etapa";
