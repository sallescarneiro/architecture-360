-- Reversão da 0014 (T-219, carga inicial da Programação do Vobi). Nada disto afeta o Vobi.
DROP TABLE IF EXISTS "vobi_tarefa_historico";
ALTER TABLE "tarefa" DROP COLUMN IF EXISTS "id_vobi";
ALTER TABLE "vobi_tarefa" DROP COLUMN IF EXISTS "estimada_horas";
ALTER TABLE "vobi_tarefa" DROP COLUMN IF EXISTS "realizadas_horas";
ALTER TABLE "vobi_tarefa" DROP COLUMN IF EXISTS "criado_vobi_em";
-- só volta a ser obrigatória se nenhuma atividade estiver sem início (senão, decidir caso a caso antes)
ALTER TABLE "atividade" ALTER COLUMN "inicio" SET NOT NULL;
