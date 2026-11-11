CREATE TABLE "vobi_responsavel" (
	"id_vobi" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"origem" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carga" ADD COLUMN "origem" text DEFAULT 'csv' NOT NULL;