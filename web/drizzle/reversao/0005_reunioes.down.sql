-- Reversão de 0005_reunioes (T-188). Apaga reuniões, itens e histórico do A360. Nada no Google ou no Vobi é afetado.
DROP TABLE IF EXISTS "reuniao_historico";
DROP TABLE IF EXISTS "reuniao_item";
DROP TABLE IF EXISTS "reuniao";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
