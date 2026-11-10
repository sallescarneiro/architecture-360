-- Reversão de 0009_entregaveis (T-190).
DROP TABLE IF EXISTS "entregavel_historico";
DROP TABLE IF EXISTS "entregavel_comentario";
DROP TABLE IF EXISTS "entregavel_aprovacao";
DROP TABLE IF EXISTS "entregavel_versao";
DROP TABLE IF EXISTS "entregavel";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
