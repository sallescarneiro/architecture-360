-- Reversão da 0013 (T-219 Fase 1, ensaio). Remove o registro do ensaio na fila de envio.
ALTER TABLE "vobi_envio" DROP COLUMN IF EXISTS "simulacao";
ALTER TABLE "vobi_envio" DROP COLUMN IF EXISTS "simulado_em";
