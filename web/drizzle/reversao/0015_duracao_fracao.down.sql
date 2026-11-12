-- Reversão da 0015: volta a inteiro (arredonda)
ALTER TABLE "vobi_tarefa" ALTER COLUMN "duracao_dias" SET DATA TYPE integer USING round("duracao_dias");
