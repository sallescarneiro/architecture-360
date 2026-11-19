-- T-256 (18/11/2026): preenchimento único do acompanhamento dos projetos ativos (Etapa C) a partir das planilhas
-- RUCELLE_PLANILHA PROJETOS (aba PROJETOS ATIVOS, editada por Ana Paula em 17/11) e FR_PLANILHA PROJETOS (editada em 18/11).
-- Decisões de Rodrigo em 18/11/2026: preencher o A360; a RUCELLE vale para responsável, etapa, situação e ação; da FR entram
-- o pedido do cliente e a comunicação da semana, e a arquiteta que acompanha os terceirizados e os pausados (a RUCELLE não diz);
-- ação sem data prevista não é gravada.
-- Regras de segurança: só insere; NUNCA sobrescreve um projeto que a coordenação já preencheu (ON CONFLICT DO NOTHING);
-- só grava para projetos que existem no cadastro do A360; projeto sem código conhecido é casado pelo nome do Vobi
-- (final do nome igual, um único resultado) ou fica de fora; arquiteta sem usuário no A360 fica sem responsável.
-- Nada é gravado no Vobi. Reversão: drizzle/reversao/0022_planilha_acompanhamento.down.sql
CREATE TEMP TABLE _pl (codigo integer, nome text, email text, situacao text, etapa text, terceirizado boolean, acao text, ate text, pedido text, comunicacao text);
--> statement-breakpoint
INSERT INTO _pl VALUES
(458527, 'AKIME HEALTH HOME (Simone)', 'amanda.monteiro@rucelle.com.br', 'andamento', '3D', false, 'Cobrar feedback', '2026-11-05', NULL, 'feita'),
(454172, 'CASA ESTEVÃO STRONDA', 'amanda.monteiro@rucelle.com.br', 'andamento', '3D', false, 'Marcar reunião', '2026-11-26', NULL, 'feita'),
(519946, 'ESPAÇO FITNESS - HYROX', 'amanda.monteiro@rucelle.com.br', 'andamento', 'LEV', false, NULL, NULL, NULL, 'feita'),
(259107, 'EXITO TREINAMENTO ESPECIALIZADO.', 'amanda.monteiro@rucelle.com.br', 'andamento', 'REF', false, NULL, NULL, NULL, 'feita'),
(507312, 'IZI GYN CUIABA', 'amanda.monteiro@rucelle.com.br', 'andamento', 'LEV', false, NULL, NULL, NULL, 'feita'),
(504508, 'JU PARRA ELASTIC TRAINING', 'amanda.monteiro@rucelle.com.br', 'andamento', 'LAY', false, 'Cobrar feedback', '2026-11-06', NULL, 'feita'),
(417075, 'KONNEN - BAIRRO CONFORTO', 'amanda.monteiro@rucelle.com.br', 'andamento', '3D', false, 'Marcar reunião', '2026-11-30', NULL, 'feita'),
(503930, 'MUSCLE TRAINING', 'amanda.monteiro@rucelle.com.br', 'andamento', 'LAY', false, 'Cobrar feedback', '2026-11-09', 'Da planilha FR (18/11): LAYOUT VESTIÁRIOS', 'feita'),
(450066, 'YUGEN (ELIANE PEDROSA)', 'amanda.monteiro@rucelle.com.br', 'andamento', '3D', false, 'Marcar reunião', '2026-11-23', NULL, 'feita'),
(475532, 'ACADEMIA BOA FORMA (VERTZ)', 'maiara.bernardi@rucelle.com.br', 'andamento', 'EXE', false, 'Finalização', '2026-12-02', NULL, 'feita'),
(473356, 'ACADEMIA IRMÃO LOPES (MARECHAL)', 'giovanna.machado@rucelle.com.br', 'andamento', 'INT', false, 'Finalização', '2026-12-02', 'Da planilha FR (18/11): PRIORIDADE A.M.', 'feita'),
(514310, 'BODY FIT', 'luryan.nunes@rucelle.com.br', 'andamento', 'PN', false, NULL, NULL, NULL, 'feita'),
(444599, 'RELOAD WELLNESS', 'amanda.monteiro@rucelle.com.br', 'andamento', 'INT', false, NULL, NULL, NULL, NULL),
(340792, 'FIVE STAR FITNESS', 'amanda.monteiro@rucelle.com.br', 'andamento', 'INT', false, 'Finalização', '2026-11-27', NULL, 'feita'),
(422014, 'ACADEMIA ATLANTA', 'giovanna.machado@rucelle.com.br', 'andamento', 'EXE', false, 'Finalização', '2026-11-12', NULL, 'feita'),
(412728, 'ACADEMIA CISPER - DANFER', 'giovanna.machado@rucelle.com.br', 'andamento', 'REF', false, 'Marcar reunião', '2026-10-01', NULL, 'feita'),
(414114, 'ACADEMIA EVOLUCAO FITNESS', 'giovanna.machado@rucelle.com.br', 'andamento', 'REF', false, 'Cobrar feedback', '2026-11-17', NULL, 'feita'),
(460299, 'ACADEMIA WELL UP', 'giovanna.machado@rucelle.com.br', 'andamento', 'REF', false, 'Cobrar feedback', '2026-11-09', NULL, 'feita'),
(432859, 'K-2 FIT CENTER', 'giovanna.machado@rucelle.com.br', 'andamento', '3D', false, NULL, NULL, 'Da planilha FR (18/11): PRÉ-EXEC', 'feita'),
(459229, 'MEGA FITNESS', 'giovanna.machado@rucelle.com.br', 'andamento', '3D', false, 'Marcar reunião', '2026-12-03', NULL, 'feita'),
(489635, 'STARKE ACADEMIA', 'giovanna.machado@rucelle.com.br', 'andamento', 'REF', false, 'Cobrar feedback', '2026-11-13', NULL, 'feita'),
(519968, 'ESPAÇO FITNESS - UNID JARDIM ALVORADA', 'giovanna.machado@rucelle.com.br', 'andamento', 'LEV', false, NULL, NULL, NULL, 'feita'),
(492397, 'ACADEMIA FLIPPER', 'isys.monteiro@rucelle.com.br', 'andamento', '3D', false, 'Marcar reunião', '2026-12-02', NULL, 'feita'),
(506053, 'BOX RC BEACH - ADITIVO', 'isys.monteiro@rucelle.com.br', 'andamento', 'PN', false, NULL, NULL, 'Da planilha FR (18/11): prazo reduzido', 'feita'),
(504500, 'CTRC CUPECÊ', 'isys.monteiro@rucelle.com.br', 'andamento', 'LAY', false, 'Cobrar feedback', '2026-11-17', 'Da planilha FR (18/11): Não aprovar nada, só ata (25dias corridos)', 'feita'),
(507003, 'EVOQUE', 'isys.monteiro@rucelle.com.br', 'andamento', 'PN', false, NULL, NULL, 'Da planilha FR (18/11): cobrar de novo', 'feita'),
(404192, 'PERALTA FITNESS - UNID. INTERLAGOS', 'isys.monteiro@rucelle.com.br', 'andamento', 'REF', false, 'Cobrar feedback', '2026-11-10', 'Da planilha FR (18/11): só vest kids', 'feita'),
(513073, 'RECOVERY - SKYFIT', 'isys.monteiro@rucelle.com.br', 'andamento', 'REF', false, NULL, NULL, NULL, NULL),
(481867, 'TWO S GYM', 'isys.monteiro@rucelle.com.br', 'andamento', '3D', false, NULL, NULL, NULL, 'feita'),
(279445, 'ACADEMIA SUPREME', 'luryan.nunes@rucelle.com.br', 'andamento', 'REF', false, NULL, NULL, NULL, 'feita'),
(473293, 'CT LIDER - AMPLIAÇÃO (CENTRO)', 'luryan.nunes@rucelle.com.br', 'andamento', 'REF', false, 'Cobrar feedback', '2026-11-13', NULL, NULL),
(473352, 'CT LIDER LOW COST', 'luryan.nunes@rucelle.com.br', 'andamento', 'LAY', false, NULL, NULL, NULL, NULL),
(501775, 'FEMME STUDIO', 'luryan.nunes@rucelle.com.br', 'andamento', 'PN', false, NULL, NULL, 'Da planilha FR (18/11): COBRAR APROVAÇÃO', 'feita'),
(507848, 'KELLY CHRISTINA', 'luryan.nunes@rucelle.com.br', 'andamento', 'LAY', false, 'Marcar reunião', '2026-11-17', NULL, 'feita'),
(414147, 'SKY FIT (JOÃO GABRIEL)', 'isys.monteiro@rucelle.com.br', 'andamento', 'INT', false, 'Finalização', '2026-11-10', NULL, 'feita'),
(506426, 'UPSPORTS - 02', 'luryan.nunes@rucelle.com.br', 'andamento', 'LAY', false, 'Marcar reunião', '2026-11-11', NULL, NULL),
(519961, 'ESPAÇO FITNESS - UNID PELE', 'maiara.bernardi@rucelle.com.br', 'andamento', 'LEV', false, NULL, NULL, NULL, 'feita'),
(445415, 'ACADEMIA BE HEALTHY', 'maiara.bernardi@rucelle.com.br', 'andamento', 'LAY', false, NULL, NULL, NULL, 'feita'),
(502292, 'ACADEMIA FITPONG', 'maiara.bernardi@rucelle.com.br', 'andamento', 'LAY', false, 'Marcar reunião', '2026-11-09', NULL, 'feita'),
(518966, 'MOVEMENT - SP', 'maiara.bernardi@rucelle.com.br', 'andamento', 'LEV', false, NULL, NULL, 'Da planilha FR (18/11): FLÁVIA VAI PARTICIPAR', 'feita'),
(451708, 'MY LEGACY - UNIDADE SÃO JOÃO', 'maiara.bernardi@rucelle.com.br', 'andamento', 'CF', false, 'Finalização', '2026-12-03', NULL, NULL),
(444782, 'SEREIA ACADEMIA', 'maiara.bernardi@rucelle.com.br', 'andamento', '3D', false, 'Marcar reunião', '2026-11-30', 'Da planilha FR (18/11): marcar com flavia', 'feita'),
(418322, 'ACADEMIA BOA FORMA', 'isys.monteiro@rucelle.com.br', 'andamento', 'INT', false, NULL, NULL, 'Da planilha FR (18/11): CV E VISTAS (PAUSADO MARILIA PRA AJUDAR NA SKY)', NULL),
(506590, 'G3 FIT - PROJETO SORTEADO FITNESS BRASIL', 'marilia.tegner@rucelle.com.br', 'andamento', 'PN', false, NULL, NULL, NULL, 'feita'),
(486629, 'GAVIOES OSASCO', 'amanda.monteiro@rucelle.com.br', 'andamento', 'INT', false, NULL, NULL, NULL, NULL),
(388544, 'CAC BOULEVARD - BE.LIVE', 'luryan.nunes@rucelle.com.br', 'andamento', 'INT', false, 'Finalização', '2026-11-16', NULL, 'feita'),
(518508, 'NATHAN E MARCOS', 'pietra.consoli@rucelle.com.br', 'andamento', 'LEV', false, NULL, NULL, 'Revisão da gerência (19/11): acompanhamento da Amanda', 'feita'),
(477105, 'UPSPORTS STUDIO (Unid. ICARAÍ)', 'pietra.consoli@rucelle.com.br', 'concluido', 'INT', false, NULL, NULL, 'Revisão da gerência (19/11): projeto finalizado, já entregue', NULL),
(471161, 'PRISCYLLA RIBEIRO', 'luryan.nunes@rucelle.com.br', 'andamento', 'EXE', true, 'Finalização', '2026-11-17', NULL, 'feita'),
(419885, 'ARENA PORTO', 'isys.monteiro@rucelle.com.br', 'andamento', 'INT', true, 'Finalização', '2026-11-19', NULL, 'feita'),
(489561, 'TM PERFORMANCE', 'maiara.bernardi@rucelle.com.br', 'andamento', 'EXE', true, 'Finalização', '2026-11-27', NULL, 'feita'),
(478416, 'STUDIO NUVO', 'luryan.nunes@rucelle.com.br', 'andamento', 'INT', true, 'Finalização', '2026-11-19', NULL, 'feita'),
(428569, 'CTRC - VILA GUIOMAR', 'isys.monteiro@rucelle.com.br', 'andamento', 'INT', true, 'Finalização', '2026-11-25', 'Da planilha FR (18/11): FACHADA ENTREGUE/ FALTA RESTANTE EXE', 'feita'),
(477111, 'INTERIORES - HIMOVE (TONI DANTAS)', 'amanda.monteiro@rucelle.com.br', 'andamento', 'INT', true, 'Finalização', '2026-11-23', NULL, 'feita'),
(378912, 'ACADEMIA ENERGY FITNESS', 'maiara.bernardi@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, NULL),
(328723, 'Academia GP Performance', 'luryan.nunes@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(370274, 'ACADEMIA NEW FIT', 'giovanna.machado@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(362387, 'CASA DO LAGO ARMILIATO', 'amanda.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(152715, 'CASA FERNANDA E VINICIUS', NULL, 'pausado', NULL, false, NULL, NULL, NULL, NULL),
(378399, 'CENTRO DE TREINAMENTO MARCIO GONCALVES', 'isys.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(380133, 'GAVIÕES - JATIUCA', 'maiara.bernardi@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(327170, 'GOLD ACADEMIA - NOVA FRAGATA - UND 3', 'isys.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(344077, 'GOLD ACADEMIA - UNIDADE 1 - OSÓRIO', 'isys.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, NULL),
(454162, 'MAKE FIT - ITAPEVI', 'isys.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(174309, 'MANIA ECOOLIFE', 'amanda.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(341960, 'NEW TIME', 'isys.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, NULL),
(359850, 'PONTO ZERO ACADEMIA - Unid. Alphaville', 'maiara.bernardi@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(491577, 'RAYA FIT ACADEMIA', 'giovanna.machado@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(322835, 'SOMA Academia', 'isys.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(423655, 'SYM CLUB (JOQUEI CLUB)', 'luryan.nunes@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, NULL),
(139123, 'TEAM MILLER', 'luryan.nunes@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, 'na'),
(334137, 'WGA', 'amanda.monteiro@rucelle.com.br', 'pausado', NULL, false, NULL, NULL, NULL, NULL),
(519656, 'CIA DO CORPO', 'maiara.bernardi@rucelle.com.br', 'andamento', NULL, false, NULL, NULL, NULL, NULL);
--> statement-breakpoint
UPDATE _pl SET codigo = (SELECT p.codigo FROM projeto p WHERE upper(p.nome) LIKE '%- ' || upper(_pl.nome) OR upper(p.nome) LIKE '% ' || upper(_pl.nome))
WHERE codigo IS NULL AND (SELECT count(*) FROM projeto p WHERE upper(p.nome) LIKE '%- ' || upper(_pl.nome) OR upper(p.nome) LIKE '% ' || upper(_pl.nome)) = 1;
--> statement-breakpoint
DELETE FROM _pl WHERE codigo IS NULL OR codigo NOT IN (SELECT codigo FROM projeto);
--> statement-breakpoint
INSERT INTO agenda_terceirizado (nome) SELECT 'Escritório terceirizado (a identificar)' WHERE EXISTS (SELECT 1 FROM _pl WHERE terceirizado)
AND NOT EXISTS (SELECT 1 FROM agenda_terceirizado WHERE nome = 'Escritório terceirizado (a identificar)');
--> statement-breakpoint
CREATE TEMP TABLE _novos (codigo integer);
--> statement-breakpoint
WITH ins AS (
  INSERT INTO agenda_projeto (projeto_codigo, responsavel_id, situacao, etapa, terceirizado_id, acao_tipo, acao_quem_id, acao_ate, atualizado_em)
  SELECT pl.codigo, u.id, pl.situacao, pl.etapa,
    CASE WHEN pl.terceirizado THEN (SELECT id FROM agenda_terceirizado WHERE nome = 'Escritório terceirizado (a identificar)' ORDER BY id LIMIT 1) END,
    CASE WHEN u.id IS NOT NULL THEN pl.acao END, CASE WHEN u.id IS NOT NULL AND pl.acao IS NOT NULL THEN u.id END, CASE WHEN u.id IS NOT NULL AND pl.acao IS NOT NULL THEN pl.ate END, now()
  FROM _pl pl LEFT JOIN usuario u ON lower(u.email) = pl.email
  ON CONFLICT (projeto_codigo) DO NOTHING
  RETURNING projeto_codigo
) INSERT INTO _novos SELECT projeto_codigo FROM ins;
--> statement-breakpoint
INSERT INTO agenda_solicitacao (projeto_codigo, texto) SELECT pl.codigo, pl.pedido FROM _pl pl JOIN _novos n ON n.codigo = pl.codigo WHERE pl.pedido IS NOT NULL;
--> statement-breakpoint
INSERT INTO agenda_comunicacao (projeto_codigo, semana, situacao) SELECT pl.codigo, '2026-11-16', pl.comunicacao FROM _pl pl JOIN _novos n ON n.codigo = pl.codigo WHERE pl.comunicacao IS NOT NULL
ON CONFLICT (projeto_codigo, semana) DO NOTHING;
--> statement-breakpoint
INSERT INTO agenda_historico (entidade, entidade_id, resumo) SELECT 'projeto', codigo, 'acompanhamento preenchido a partir das planilhas RUCELLE (17/11) e FR (18/11), por decisão de Rodrigo em 18/11/2026; responsáveis e códigos revisados pela gerência (Thaís) em 19/11/2026' FROM _novos;
--> statement-breakpoint
DROP TABLE IF EXISTS _novos;
--> statement-breakpoint
DROP TABLE IF EXISTS _pl;
