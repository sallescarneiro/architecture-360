-- Reversão de 0003_agenda (T-187 Etapa 1). Apaga o espelho da Agenda e as conexões (tokens cifrados). Nada no Google ou no Vobi é afetado.
DROP TABLE IF EXISTS "evento_agenda";
DROP TABLE IF EXISTS "conexao_agenda";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
