CREATE TABLE "alerta" (
	"id" serial PRIMARY KEY NOT NULL,
	"carga_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"entidade" text NOT NULL,
	"chave" text,
	"detalhe" text
);
--> statement-breakpoint
CREATE TABLE "bruto_projeto" (
	"id" serial PRIMARY KEY NOT NULL,
	"carga_id" integer NOT NULL,
	"linha" integer NOT NULL,
	"dados" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bruto_tarefa" (
	"id" serial PRIMARY KEY NOT NULL,
	"carga_id" integer NOT NULL,
	"linha" integer NOT NULL,
	"dados" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carga" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"motivo" text,
	"data_carga" text NOT NULL,
	"enviado_por_id" integer,
	"confirmado_por_id" integer,
	"arq_projetos" text,
	"hash_projetos" text,
	"linhas_projetos" integer,
	"arq_tarefas" text,
	"hash_tarefas" text,
	"linhas_tarefas" integer,
	"conteudo_projetos" "bytea",
	"conteudo_tarefas" "bytea",
	"relatorio" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "historico_alteracoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"carga_id" integer NOT NULL,
	"entidade" text NOT NULL,
	"chave" text NOT NULL,
	"campo" text NOT NULL,
	"valor_anterior" text,
	"valor_novo" text
);
--> statement-breakpoint
CREATE TABLE "pessoa_vobi" (
	"nome_vobi" text PRIMARY KEY NOT NULL,
	"chave_nome" text NOT NULL,
	"email_rucelle" text,
	"origem" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projeto" (
	"codigo" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"chave_nome" text NOT NULL,
	"cliente" text,
	"status" text,
	"status_classe" text,
	"criado_em" text,
	"metragem" real,
	"etiquetas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"colaboradores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primeira_carga" integer NOT NULL,
	"ultima_carga" integer NOT NULL,
	"nao_encontrado_desde" integer
);
--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarefa" (
	"chave" text PRIMARY KEY NOT NULL,
	"projeto_codigo" integer,
	"projeto_nome_csv" text,
	"etapa_csv" text,
	"etapa_canonica" text,
	"etapa_conhecida" boolean DEFAULT true NOT NULL,
	"nome" text NOT NULL,
	"nome_chave" text NOT NULL,
	"ocorrencia" integer DEFAULT 1 NOT NULL,
	"revisao" integer,
	"status" text,
	"prioridade" text,
	"data_inicio" text,
	"data_fim" text,
	"horas_estimadas_min" integer,
	"horas_realizadas_min" integer,
	"responsavel_nome" text,
	"responsavel_email" text,
	"sem_responsavel" boolean DEFAULT false NOT NULL,
	"sem_inicio" boolean DEFAULT false NOT NULL,
	"sem_fim" boolean DEFAULT false NOT NULL,
	"orfa" boolean DEFAULT false NOT NULL,
	"colisao" boolean DEFAULT false NOT NULL,
	"classe_qualidade" text NOT NULL,
	"primeira_carga" integer NOT NULL,
	"ultima_carga" integer NOT NULL,
	"nao_encontrado_desde" integer,
	"motivo_nao_encontrado" text
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"perfil" text DEFAULT 'arquiteta' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bruto_projeto" ADD CONSTRAINT "bruto_projeto_carga_id_carga_id_fk" FOREIGN KEY ("carga_id") REFERENCES "public"."carga"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bruto_tarefa" ADD CONSTRAINT "bruto_tarefa_carga_id_carga_id_fk" FOREIGN KEY ("carga_id") REFERENCES "public"."carga"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carga" ADD CONSTRAINT "carga_enviado_por_id_usuario_id_fk" FOREIGN KEY ("enviado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carga" ADD CONSTRAINT "carga_confirmado_por_id_usuario_id_fk" FOREIGN KEY ("confirmado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerta_carga_idx" ON "alerta" USING btree ("carga_id");--> statement-breakpoint
CREATE INDEX "bruto_projeto_carga_idx" ON "bruto_projeto" USING btree ("carga_id");--> statement-breakpoint
CREATE INDEX "bruto_tarefa_carga_idx" ON "bruto_tarefa" USING btree ("carga_id");--> statement-breakpoint
CREATE INDEX "hist_carga_idx" ON "historico_alteracoes" USING btree ("carga_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pessoa_vobi_chave_idx" ON "pessoa_vobi" USING btree ("chave_nome");--> statement-breakpoint
CREATE INDEX "projeto_chave_nome_idx" ON "projeto" USING btree ("chave_nome");--> statement-breakpoint
CREATE INDEX "tarefa_projeto_idx" ON "tarefa" USING btree ("projeto_codigo");--> statement-breakpoint
CREATE INDEX "tarefa_ultima_carga_idx" ON "tarefa" USING btree ("ultima_carga");