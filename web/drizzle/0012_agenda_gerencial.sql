CREATE TABLE "atividade_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"atividade_id" integer NOT NULL,
	"origem" text NOT NULL,
	"usuario_id" integer,
	"resumo" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atividade" (
	"id" serial PRIMARY KEY NOT NULL,
	"vinculo" text NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"responsavel_id" integer NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"dia_inteiro" boolean DEFAULT false NOT NULL,
	"estimada_horas" integer,
	"prioridade" integer DEFAULT 2 NOT NULL,
	"status" integer DEFAULT 1 NOT NULL,
	"projeto_codigo" integer,
	"etapa_vobi_id" integer,
	"tarefa_vobi_id" integer,
	"estado_vobi" text DEFAULT 'local' NOT NULL,
	"base_vobi" jsonb,
	"pendentes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conflitos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_por_id" integer,
	"atualizado_por_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "atividade_tarefa_vobi_id_unique" UNIQUE("tarefa_vobi_id")
);
--> statement-breakpoint
CREATE TABLE "vobi_envio" (
	"id" serial PRIMARY KEY NOT NULL,
	"atividade_id" integer NOT NULL,
	"operacao" text NOT NULL,
	"campos" jsonb NOT NULL,
	"estado" text DEFAULT 'aguardando' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"resposta" text,
	"criado_por_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vobi_etapa" (
	"id_vobi" integer PRIMARY KEY NOT NULL,
	"id_refurbish" integer NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer,
	"inicio" timestamp with time zone,
	"fim" timestamp with time zone,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vobi_tarefa" (
	"id_vobi" integer PRIMARY KEY NOT NULL,
	"id_refurbish" integer,
	"id_etapa" integer,
	"nome" text NOT NULL,
	"id_responsavel" integer,
	"status" integer,
	"prioridade" integer,
	"inicio" timestamp with time zone,
	"fim" timestamp with time zone,
	"duracao_dias" integer,
	"atualizado_vobi_em" timestamp with time zone,
	"visto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ausente_desde" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atividade_historico" ADD CONSTRAINT "atividade_historico_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade_historico" ADD CONSTRAINT "atividade_historico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_criado_por_id_usuario_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_atualizado_por_id_usuario_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vobi_envio" ADD CONSTRAINT "vobi_envio_atividade_id_atividade_id_fk" FOREIGN KEY ("atividade_id") REFERENCES "public"."atividade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vobi_envio" ADD CONSTRAINT "vobi_envio_criado_por_id_usuario_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "atividade_historico_idx" ON "atividade_historico" USING btree ("atividade_id");--> statement-breakpoint
CREATE INDEX "atividade_resp_idx" ON "atividade" USING btree ("responsavel_id","inicio");--> statement-breakpoint
CREATE INDEX "atividade_proj_idx" ON "atividade" USING btree ("projeto_codigo");--> statement-breakpoint
CREATE INDEX "vobi_envio_ativ_idx" ON "vobi_envio" USING btree ("atividade_id");--> statement-breakpoint
CREATE INDEX "vobi_envio_estado_idx" ON "vobi_envio" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "vobi_etapa_proj_idx" ON "vobi_etapa" USING btree ("id_refurbish");--> statement-breakpoint
CREATE INDEX "vobi_tarefa_proj_idx" ON "vobi_tarefa" USING btree ("id_refurbish");--> statement-breakpoint
CREATE INDEX "vobi_tarefa_resp_idx" ON "vobi_tarefa" USING btree ("id_responsavel");