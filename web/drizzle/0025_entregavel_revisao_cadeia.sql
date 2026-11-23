ALTER TABLE "agenda_pessoa" ADD COLUMN IF NOT EXISTS "senior" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "entregavel" ADD COLUMN IF NOT EXISTS "revisor_id" integer REFERENCES "usuario"("id");
--> statement-breakpoint
ALTER TABLE "entregavel" ADD COLUMN IF NOT EXISTS "etapa_revisao" text;
--> statement-breakpoint
ALTER TABLE "entregavel_aprovacao" ADD COLUMN IF NOT EXISTS "nivel" text;
--> statement-breakpoint
UPDATE "entregavel" SET "etapa_revisao" = 'coordenacao' WHERE "status" = 'revisao_interna' AND "etapa_revisao" IS NULL;
--> statement-breakpoint
-- arquitetas sênior informadas por Rodrigo em 23/11/2026: Isys, Amanda e Luryan (e-mail com ou sem ponto)
INSERT INTO "agenda_pessoa" ("usuario_id", "senior")
  SELECT u.id, true FROM "usuario" u WHERE replace(split_part(lower(u.email), '@', 1), '.', '') IN ('isysmonteiro', 'amandamonteiro', 'luryannunes')
  ON CONFLICT ("usuario_id") DO UPDATE SET "senior" = true;
