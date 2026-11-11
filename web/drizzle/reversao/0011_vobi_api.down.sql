-- Reversão da 0011 (T-218, API do Vobi). Remove o mapa id → nome dos responsáveis e a origem da carga.
DROP TABLE IF EXISTS "vobi_responsavel";
ALTER TABLE "carga" DROP COLUMN IF EXISTS "origem";
