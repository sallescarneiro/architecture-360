-- Reversão da 0020 (Etapa C da Agenda de Produção). Remove só as tabelas novas; nada da Etapa A, do Vobi ou do histórico é tocado.
DROP TABLE IF EXISTS "agenda_comunicacao";
DROP TABLE IF EXISTS "agenda_solicitacao";
DROP TABLE IF EXISTS "agenda_projeto";
DROP TABLE IF EXISTS "agenda_tipo_acao";
DROP TABLE IF EXISTS "agenda_terceirizado";
DROP TABLE IF EXISTS "agenda_regra";
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
