-- Reversão manual da migração 0002_clientes_vobi (não executada automaticamente).
-- Remove apenas o que a 0002 criou; projeto/tarefa/carga existentes não são tocados além das colunas novas.
DROP INDEX IF EXISTS "projeto_cliente_idx";
DROP INDEX IF EXISTS "cliente_vobi_chave_nome_idx";
ALTER TABLE "projeto" DROP COLUMN IF EXISTS "vinculo_cliente_status";
ALTER TABLE "projeto" DROP COLUMN IF EXISTS "cliente_codigo";
ALTER TABLE "carga" DROP COLUMN IF EXISTS "conteudo_clientes";
ALTER TABLE "carga" DROP COLUMN IF EXISTS "linhas_clientes";
ALTER TABLE "carga" DROP COLUMN IF EXISTS "hash_clientes";
ALTER TABLE "carga" DROP COLUMN IF EXISTS "arq_clientes";
ALTER TABLE "carga" DROP COLUMN IF EXISTS "tipo";
DROP TABLE IF EXISTS "vinculo_cliente_manual";
DROP TABLE IF EXISTS "cliente_vobi";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE hash = (SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1);
