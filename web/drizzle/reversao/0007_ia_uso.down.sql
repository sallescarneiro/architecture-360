-- Reversão de 0007_ia_uso.
DROP TABLE IF EXISTS "ia_uso";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
