-- Reversão da 0022 (preenchimento a partir das planilhas). Remove só o que a 0022 criou e que ninguém alterou depois.
DELETE FROM agenda_solicitacao s USING agenda_historico h
 WHERE h.entidade = 'projeto' AND h.entidade_id = s.projeto_codigo AND h.resumo LIKE 'acompanhamento preenchido a partir das planilhas%' AND (s.texto LIKE 'Da planilha FR (18/11):%' OR s.texto LIKE 'Revisão da gerência (19/11):%') AND s.usuario_id IS NULL;
DELETE FROM agenda_comunicacao c USING agenda_historico h
 WHERE h.entidade = 'projeto' AND h.entidade_id = c.projeto_codigo AND h.resumo LIKE 'acompanhamento preenchido a partir das planilhas%' AND c.semana = '2026-11-16' AND c.usuario_id IS NULL;
DELETE FROM agenda_projeto a USING agenda_historico h
 WHERE h.entidade = 'projeto' AND h.entidade_id = a.projeto_codigo AND h.resumo LIKE 'acompanhamento preenchido a partir das planilhas%' AND a.atualizado_por_id IS NULL;
DELETE FROM agenda_historico WHERE entidade = 'projeto' AND resumo LIKE 'acompanhamento preenchido a partir das planilhas%';
DELETE FROM agenda_terceirizado t WHERE t.nome = 'Escritório terceirizado (a identificar)' AND NOT EXISTS (SELECT 1 FROM agenda_projeto a WHERE a.terceirizado_id = t.id);
DELETE FROM drizzle.__drizzle_migrations WHERE id = (SELECT max(id) FROM drizzle.__drizzle_migrations);
