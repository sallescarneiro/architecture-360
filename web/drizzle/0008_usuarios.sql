ALTER TABLE "usuario" ADD COLUMN "trocar_senha" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "ultimo_acesso_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "usuario" ADD COLUMN "atualizado_em" timestamp with time zone;