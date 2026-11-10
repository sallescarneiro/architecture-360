-- Reversão de 0008_usuarios (T-205).
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "trocar_senha";
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "ultimo_acesso_em";
ALTER TABLE "usuario" DROP COLUMN IF EXISTS "atualizado_em";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
