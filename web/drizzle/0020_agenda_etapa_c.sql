CREATE TABLE "agenda_comunicacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_codigo" integer NOT NULL,
	"semana" text NOT NULL,
	"situacao" text NOT NULL,
	"usuario_id" integer,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_projeto" (
	"projeto_codigo" integer PRIMARY KEY NOT NULL,
	"responsavel_id" integer,
	"situacao" text DEFAULT 'andamento' NOT NULL,
	"etapa" text,
	"terceirizado_id" integer,
	"acao_tipo" text,
	"acao_quem_id" integer,
	"acao_ate" text,
	"atualizado_por_id" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_regra" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL,
	"atualizado_por_id" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_solicitacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_codigo" integer NOT NULL,
	"texto" text NOT NULL,
	"usuario_id" integer,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_terceirizado" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"contato" text,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_tipo_acao" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_comunicacao" ADD CONSTRAINT "agenda_comunicacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_projeto" ADD CONSTRAINT "agenda_projeto_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_projeto" ADD CONSTRAINT "agenda_projeto_acao_quem_id_usuario_id_fk" FOREIGN KEY ("acao_quem_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_projeto" ADD CONSTRAINT "agenda_projeto_atualizado_por_id_usuario_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_regra" ADD CONSTRAINT "agenda_regra_atualizado_por_id_usuario_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_solicitacao" ADD CONSTRAINT "agenda_solicitacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_comunicacao_semana_idx" ON "agenda_comunicacao" USING btree ("projeto_codigo","semana");--> statement-breakpoint
CREATE INDEX "agenda_solicitacao_proj_idx" ON "agenda_solicitacao" USING btree ("projeto_codigo");--> statement-breakpoint
INSERT INTO "agenda_tipo_acao" ("nome") VALUES ('Cobrar feedback'),('Marcar reunião'),('Aguardando informação'),('Cobrar envio de plantas ou fotos'),('Alinhar data'),('Agendar apresentação'),('Finalização');--> statement-breakpoint
INSERT INTO "agenda_regra" ("chave","valor") VALUES ('carga_alta','6'),('sobrecarga','8') ON CONFLICT ("chave") DO NOTHING;
