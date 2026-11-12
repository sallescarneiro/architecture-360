CREATE TABLE "projeto_sob_demanda" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" integer NOT NULL,
	"nome" text NOT NULL,
	"solicitado_por_id" integer NOT NULL,
	"solicitado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"situacao" text NOT NULL,
	"detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projeto" ADD COLUMN "inicio_previsto" text;--> statement-breakpoint
ALTER TABLE "projeto_sob_demanda" ADD CONSTRAINT "projeto_sob_demanda_solicitado_por_id_usuario_id_fk" FOREIGN KEY ("solicitado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projeto_sob_demanda_codigo_idx" ON "projeto_sob_demanda" USING btree ("codigo");