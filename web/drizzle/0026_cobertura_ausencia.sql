ALTER TABLE "agenda_pessoa" ADD COLUMN IF NOT EXISTS "ausente_de" text;
--> statement-breakpoint
ALTER TABLE "agenda_pessoa" ADD COLUMN IF NOT EXISTS "ausente_ate" text;
--> statement-breakpoint
ALTER TABLE "agenda_pessoa" ADD COLUMN IF NOT EXISTS "coberta_por_id" integer REFERENCES "usuario"("id");
