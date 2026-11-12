-- Reversão da 0016
ALTER TABLE "vobi_etapa" ALTER COLUMN "ordem" SET DATA TYPE integer USING round("ordem");
