-- Reversão da 0017 (T-219, recorte por data de início prevista + projetos sob demanda).
-- Não toca em projetos, tarefas nem no espelho: só remove o registro de pedidos e a coluna de data de início prevista.
DROP TABLE IF EXISTS "projeto_sob_demanda";
ALTER TABLE "projeto" DROP COLUMN IF EXISTS "inicio_previsto";
