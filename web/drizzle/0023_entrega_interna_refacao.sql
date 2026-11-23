ALTER TABLE "atividade" ADD COLUMN IF NOT EXISTS "entrega_interna" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN IF NOT EXISTS "motivo_refacao" text;
