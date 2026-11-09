-- Reversão de 0006_inteligencia (T-188 evolução). Nada no Google ou no Vobi é afetado.
DROP TABLE IF EXISTS "projeto_analise"; DROP TABLE IF EXISTS "flag_limitacao"; DROP TABLE IF EXISTS "projeto_alerta_historico"; DROP TABLE IF EXISTS "projeto_alerta";
DROP TABLE IF EXISTS "reuniao_processamento"; DROP TABLE IF EXISTS "reuniao_transcricao";
ALTER TABLE "reuniao_item" DROP COLUMN IF EXISTS "origem", DROP COLUMN IF EXISTS "confianca", DROP COLUMN IF EXISTS "trecho", DROP COLUMN IF EXISTS "tempo", DROP COLUMN IF EXISTS "processamento_id", DROP COLUMN IF EXISTS "confirmado";
ALTER TABLE "reuniao" DROP COLUMN IF EXISTS "ata_origem", DROP COLUMN IF EXISTS "ata_estruturada";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
