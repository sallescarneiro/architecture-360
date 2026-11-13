-- Reversão da 0018 (T-227, Etapa 1 da Inteligência de Reuniões). Remove motivos, origem, gravação e aviso das reuniões.
-- As transcrições novas guardam só o texto ("conteudo" nulo); a restrição NOT NULL de "conteudo" não é restaurada aqui.
DROP TABLE IF EXISTS "reuniao_motivo_historico";
DROP TABLE IF EXISTS "reuniao_motivo";
ALTER TABLE "reuniao" DROP COLUMN IF EXISTS "motivo_id", DROP COLUMN IF EXISTS "origem", DROP COLUMN IF EXISTS "gravacao_url",
  DROP COLUMN IF EXISTS "gravacao_plataforma", DROP COLUMN IF EXISTS "gravacao_data", DROP COLUMN IF EXISTS "gravacao_duracao_min",
  DROP COLUMN IF EXISTS "aviso_gravacao_forma", DROP COLUMN IF EXISTS "aviso_gravacao_por", DROP COLUMN IF EXISTS "aviso_gravacao_em";
ALTER TABLE "reuniao_transcricao" DROP COLUMN IF EXISTS "hash", DROP COLUMN IF EXISTS "link_original", DROP COLUMN IF EXISTS "entrada";
