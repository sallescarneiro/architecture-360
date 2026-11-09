CREATE TABLE "reuniao_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"reuniao_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"acao" text NOT NULL,
	"resumo" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reuniao_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"reuniao_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"responsavel" text,
	"prazo" text,
	"situacao" text DEFAULT 'aberto' NOT NULL,
	"criado_por" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reuniao" (
	"id" serial PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"projeto_codigo" integer,
	"cliente_codigo" integer,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"local" text,
	"participantes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pauta" text,
	"ata" text,
	"status" text DEFAULT 'planejada' NOT NULL,
	"evento_google_id" text,
	"evento_usuario_id" integer,
	"criado_por" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reuniao_historico" ADD CONSTRAINT "reuniao_historico_reuniao_id_reuniao_id_fk" FOREIGN KEY ("reuniao_id") REFERENCES "public"."reuniao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_historico" ADD CONSTRAINT "reuniao_historico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD CONSTRAINT "reuniao_item_reuniao_id_reuniao_id_fk" FOREIGN KEY ("reuniao_id") REFERENCES "public"."reuniao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_item" ADD CONSTRAINT "reuniao_item_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao" ADD CONSTRAINT "reuniao_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reuniao_historico_reuniao_idx" ON "reuniao_historico" USING btree ("reuniao_id");--> statement-breakpoint
CREATE INDEX "reuniao_item_reuniao_idx" ON "reuniao_item" USING btree ("reuniao_id");--> statement-breakpoint
CREATE INDEX "reuniao_projeto_idx" ON "reuniao" USING btree ("projeto_codigo");--> statement-breakpoint
CREATE INDEX "reuniao_inicio_idx" ON "reuniao" USING btree ("inicio");--> statement-breakpoint
CREATE INDEX "reuniao_evento_idx" ON "reuniao" USING btree ("evento_google_id");