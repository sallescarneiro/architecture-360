CREATE TABLE IF NOT EXISTS "atraso_justificativa" (
	"id" serial PRIMARY KEY NOT NULL,
	"tarefa_chave" text NOT NULL,
	"id_vobi" integer,
	"projeto_codigo" integer,
	"tarefa_nome" text NOT NULL,
	"etapa" text,
	"prazo_vobi" text,
	"dias_atraso" integer,
	"categoria" text NOT NULL,
	"motivo" text NOT NULL,
	"nova_data" text,
	"registrado_por_id" integer NOT NULL REFERENCES "usuario"("id"),
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"situacao" text DEFAULT 'aguardando' NOT NULL,
	"decisao" text,
	"decidido_por_id" integer REFERENCES "usuario"("id"),
	"decidido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "atraso_justificativa_tarefa_idx" ON "atraso_justificativa" ("tarefa_chave");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "atraso_justificativa_situacao_idx" ON "atraso_justificativa" ("situacao");
