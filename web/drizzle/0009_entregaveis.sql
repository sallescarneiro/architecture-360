CREATE TABLE "entregavel_aprovacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"entregavel_id" integer NOT NULL,
	"versao_numero" integer NOT NULL,
	"instancia" text NOT NULL,
	"decisao" text NOT NULL,
	"observacao" text,
	"evidencia_tipo" text,
	"evidencia_texto" text,
	"evidencia_data" text,
	"evidencia_quem" text,
	"item_reuniao_id" integer,
	"nome_arquivo" text,
	"tipo_mime" text,
	"tamanho" integer,
	"conteudo" "bytea",
	"registrado_por" integer NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entregavel_comentario" (
	"id" serial PRIMARY KEY NOT NULL,
	"entregavel_id" integer NOT NULL,
	"texto" text NOT NULL,
	"autor_id" integer NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entregavel" (
	"id" serial PRIMARY KEY NOT NULL,
	"projeto_codigo" integer NOT NULL,
	"cliente_codigo" integer,
	"titulo" text NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text,
	"responsavel_id" integer,
	"status" text DEFAULT 'em_elaboracao' NOT NULL,
	"versao_atual" integer DEFAULT 0 NOT NULL,
	"reuniao_id" integer,
	"criado_por" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entregavel_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"entregavel_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"acao" text NOT NULL,
	"resumo" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entregavel_versao" (
	"id" serial PRIMARY KEY NOT NULL,
	"entregavel_id" integer NOT NULL,
	"numero" integer NOT NULL,
	"descricao" text,
	"link" text,
	"nome_arquivo" text,
	"tipo_mime" text,
	"tamanho" integer,
	"conteudo" "bytea",
	"enviado_por" integer NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entregavel_aprovacao" ADD CONSTRAINT "entregavel_aprovacao_entregavel_id_entregavel_id_fk" FOREIGN KEY ("entregavel_id") REFERENCES "public"."entregavel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_aprovacao" ADD CONSTRAINT "entregavel_aprovacao_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_comentario" ADD CONSTRAINT "entregavel_comentario_entregavel_id_entregavel_id_fk" FOREIGN KEY ("entregavel_id") REFERENCES "public"."entregavel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_comentario" ADD CONSTRAINT "entregavel_comentario_autor_id_usuario_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel" ADD CONSTRAINT "entregavel_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel" ADD CONSTRAINT "entregavel_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_historico" ADD CONSTRAINT "entregavel_historico_entregavel_id_entregavel_id_fk" FOREIGN KEY ("entregavel_id") REFERENCES "public"."entregavel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_historico" ADD CONSTRAINT "entregavel_historico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_versao" ADD CONSTRAINT "entregavel_versao_entregavel_id_entregavel_id_fk" FOREIGN KEY ("entregavel_id") REFERENCES "public"."entregavel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregavel_versao" ADD CONSTRAINT "entregavel_versao_enviado_por_usuario_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entregavel_aprovacao_idx" ON "entregavel_aprovacao" USING btree ("entregavel_id");--> statement-breakpoint
CREATE INDEX "entregavel_comentario_idx" ON "entregavel_comentario" USING btree ("entregavel_id");--> statement-breakpoint
CREATE INDEX "entregavel_projeto_idx" ON "entregavel" USING btree ("projeto_codigo");--> statement-breakpoint
CREATE INDEX "entregavel_status_idx" ON "entregavel" USING btree ("status");--> statement-breakpoint
CREATE INDEX "entregavel_historico_idx" ON "entregavel_historico" USING btree ("entregavel_id");--> statement-breakpoint
CREATE INDEX "entregavel_versao_idx" ON "entregavel_versao" USING btree ("entregavel_id");