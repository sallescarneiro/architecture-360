-- Reversão de 0004_agenda_etapa2 (T-187 Etapa 2). Nada no Google ou no Vobi é afetado.
DROP TABLE IF EXISTS "agenda_acao";
ALTER TABLE "conexao_agenda" DROP COLUMN IF EXISTS "escopos", DROP COLUMN IF EXISTS "calendarios";
ALTER TABLE "evento_agenda" DROP COLUMN IF EXISTS "calendario_id", DROP COLUMN IF EXISTS "descricao", DROP COLUMN IF EXISTS "organizador_email", DROP COLUMN IF EXISTS "sou_organizador", DROP COLUMN IF EXISTS "etag", DROP COLUMN IF EXISTS "recorrente_de", DROP COLUMN IF EXISTS "tipo", DROP COLUMN IF EXISTS "projeto_codigo", DROP COLUMN IF EXISTS "projeto_origem";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
