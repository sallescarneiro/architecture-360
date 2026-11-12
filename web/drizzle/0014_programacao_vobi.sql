CREATE TABLE "vobi_tarefa_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"id_vobi" integer NOT NULL,
	"campo" text NOT NULL,
	"antes" text,
	"depois" text,
	"lido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atividade" ALTER COLUMN "inicio" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tarefa" ADD COLUMN "id_vobi" integer;--> statement-breakpoint
ALTER TABLE "vobi_tarefa" ADD COLUMN "estimada_horas" double precision;--> statement-breakpoint
ALTER TABLE "vobi_tarefa" ADD COLUMN "realizadas_horas" double precision;--> statement-breakpoint
ALTER TABLE "vobi_tarefa" ADD COLUMN "criado_vobi_em" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "vobi_tarefa_historico_idx" ON "vobi_tarefa_historico" USING btree ("id_vobi");