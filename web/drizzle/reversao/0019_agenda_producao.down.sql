-- Reversão da 0019 (Etapa A da Agenda de Produção). Apaga as tabelas novas e as colunas novas da atividade.
DROP TABLE IF EXISTS "agenda_historico";
DROP TABLE IF EXISTS "agenda_indisponibilidade";
DROP TABLE IF EXISTS "agenda_feriado";
DROP TABLE IF EXISTS "agenda_pessoa";
ALTER TABLE "atividade" DROP CONSTRAINT IF EXISTS "atividade_validado_por_id_usuario_id_fk";
ALTER TABLE "atividade" DROP COLUMN IF EXISTS "etapa_rucelle", DROP COLUMN IF EXISTS "periodo", DROP COLUMN IF EXISTS "entrega", DROP COLUMN IF EXISTS "validacao", DROP COLUMN IF EXISTS "validacao_comentario", DROP COLUMN IF EXISTS "validado_por_id", DROP COLUMN IF EXISTS "validado_em", DROP COLUMN IF EXISTS "reprogramacoes", DROP COLUMN IF EXISTS "impedimento";
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
