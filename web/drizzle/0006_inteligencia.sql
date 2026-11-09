CREATE TABLE "projeto_alerta" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_codigo" integer NOT NULL,
	"chave" text NOT NULL,
	"categoria" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text NOT NULL,
	"classificacao" text NOT NULL,
	"prioridade" text NOT NULL,
	"confianca" integer,
	"evidencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impacto" text,
	"situacao" text DEFAULT 'aberto' NOT NULL,
	"responsavel" text,
	"prazo" text,
	"direcionamento" text,
	"origem" text DEFAULT 'ia' NOT NULL,
	"analise_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projeto_analise" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_codigo" integer NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"provedor" text,
	"modelo" text,
	"entradas" jsonb,
	"resultado" jsonb,
	"alertas_novos" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"iniciado_por" integer,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flag_limitacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_codigo" integer,
	"chave" text NOT NULL,
	"comparacao" text NOT NULL,
	"dado_ausente" text NOT NULL,
	"informacao_disponivel" text,
	"informacao_necessaria" text NOT NULL,
	"origem_esperada" text NOT NULL,
	"tipo" text NOT NULL,
	"analises_comprometidas" text,
	"alternativa" text,
	"situacao" text DEFAULT 'aberta' NOT NULL,
	"decidido_por" integer,
	"decidido_em" timestamp with time zone,
	"justificativa" text,
	"identificado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projeto_alerta_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"alerta_id" integer NOT NULL,
	"usuario_id" integer,
	"acao" text NOT NULL,
	"justificativa" text,
	"antes" jsonb,
	"depois" jsonb,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reuniao_processamento" (
	"id" serial PRIMARY KEY NOT NULL,
	"reuniao_id" integer NOT NULL,
	"transcricao_id" integer NOT NULL,
	"estado" text DEFAULT 'pendente' NOT NULL,
	"provedor" text,
	"modelo" text,
	"resultado" jsonb,
	"erro" text,
	"itens_criados" integer DEFAULT 0 NOT NULL,
	"iniciado_por" integer NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"concluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reuniao_transcricao" (
	"id" serial PRIMARY KEY NOT NULL,
	"reuniao_id" integer NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"atual" boolean DEFAULT true NOT NULL,
	"nome_arquivo" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"tamanho" integer NOT NULL,
	"conteudo" "bytea" NOT NULL,
	"texto" text,
	"formato" text,
	"enviado_por" integer NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD COLUMN "origem" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD COLUMN "confianca" text;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD COLUMN "trecho" text;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD COLUMN "tempo" text;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD COLUMN "processamento_id" integer;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD COLUMN "confirmado" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "ata_origem" text;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "ata_estruturada" jsonb;--> statement-breakpoint
ALTER TABLE "projeto_analise" ADD CONSTRAINT "projeto_analise_iniciado_por_usuario_id_fk" FOREIGN KEY ("iniciado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flag_limitacao" ADD CONSTRAINT "flag_limitacao_decidido_por_usuario_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_alerta_historico" ADD CONSTRAINT "projeto_alerta_historico_alerta_id_projeto_alerta_id_fk" FOREIGN KEY ("alerta_id") REFERENCES "public"."projeto_alerta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projeto_alerta_historico" ADD CONSTRAINT "projeto_alerta_historico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_processamento" ADD CONSTRAINT "reuniao_processamento_reuniao_id_reuniao_id_fk" FOREIGN KEY ("reuniao_id") REFERENCES "public"."reuniao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_processamento" ADD CONSTRAINT "reuniao_processamento_transcricao_id_reuniao_transcricao_id_fk" FOREIGN KEY ("transcricao_id") REFERENCES "public"."reuniao_transcricao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_processamento" ADD CONSTRAINT "reuniao_processamento_iniciado_por_usuario_id_fk" FOREIGN KEY ("iniciado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_transcricao" ADD CONSTRAINT "reuniao_transcricao_reuniao_id_reuniao_id_fk" FOREIGN KEY ("reuniao_id") REFERENCES "public"."reuniao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_transcricao" ADD CONSTRAINT "reuniao_transcricao_enviado_por_usuario_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projeto_alerta_chave_uq" ON "projeto_alerta" USING btree ("projeto_codigo","chave");--> statement-breakpoint
CREATE INDEX "projeto_alerta_situacao_idx" ON "projeto_alerta" USING btree ("situacao");--> statement-breakpoint
CREATE INDEX "projeto_analise_projeto_idx" ON "projeto_analise" USING btree ("projeto_codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "flag_limitacao_chave_uq" ON "flag_limitacao" USING btree ("chave");--> statement-breakpoint
CREATE INDEX "alerta_hist_idx" ON "projeto_alerta_historico" USING btree ("alerta_id");--> statement-breakpoint
CREATE INDEX "processamento_reuniao_idx" ON "reuniao_processamento" USING btree ("reuniao_id");--> statement-breakpoint
CREATE INDEX "transcricao_reuniao_idx" ON "reuniao_transcricao" USING btree ("reuniao_id");