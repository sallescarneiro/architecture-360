CREATE TABLE "agenda_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" integer,
	"resumo" text NOT NULL,
	"usuario_id" integer,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_pessoa" (
	"usuario_id" integer PRIMARY KEY NOT NULL,
	"uf" text,
	"municipio" text,
	"jornada_horas" real DEFAULT 8 NOT NULL,
	"almoco_inicio" text,
	"almoco_fim" text,
	"modelo" text DEFAULT 'indefinido' NOT NULL,
	"validadora" boolean DEFAULT false NOT NULL,
	"substituta_ate" text,
	"atualizado_por_id" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_feriado" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"nome" text NOT NULL,
	"abrangencia" text NOT NULL,
	"uf" text,
	"municipio" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por_id" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_indisponibilidade" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"inicio" text NOT NULL,
	"fim" text NOT NULL,
	"periodo" text DEFAULT 'dia' NOT NULL,
	"a_partir_de" text,
	"observacao" text,
	"situacao" text NOT NULL,
	"registrado_por_id" integer NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"decidido_por_id" integer,
	"decidido_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "etapa_rucelle" text;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "periodo" text;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "entrega" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "validacao" text DEFAULT 'confirmada' NOT NULL;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "validacao_comentario" text;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "validado_por_id" integer;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "validado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "reprogramacoes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "atividade" ADD COLUMN "impedimento" text;--> statement-breakpoint
ALTER TABLE "agenda_historico" ADD CONSTRAINT "agenda_historico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_pessoa" ADD CONSTRAINT "agenda_pessoa_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_pessoa" ADD CONSTRAINT "agenda_pessoa_atualizado_por_id_usuario_id_fk" FOREIGN KEY ("atualizado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_feriado" ADD CONSTRAINT "agenda_feriado_criado_por_id_usuario_id_fk" FOREIGN KEY ("criado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_indisponibilidade" ADD CONSTRAINT "agenda_indisponibilidade_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_indisponibilidade" ADD CONSTRAINT "agenda_indisponibilidade_registrado_por_id_usuario_id_fk" FOREIGN KEY ("registrado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_indisponibilidade" ADD CONSTRAINT "agenda_indisponibilidade_decidido_por_id_usuario_id_fk" FOREIGN KEY ("decidido_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_historico_idx" ON "agenda_historico" USING btree ("entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "agenda_feriado_data_idx" ON "agenda_feriado" USING btree ("data");--> statement-breakpoint
CREATE INDEX "agenda_indisp_usuario_idx" ON "agenda_indisponibilidade" USING btree ("usuario_id","inicio");--> statement-breakpoint
ALTER TABLE "atividade" ADD CONSTRAINT "atividade_validado_por_id_usuario_id_fk" FOREIGN KEY ("validado_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Validadoras das propostas das arquitetas autônomas (decisão de Rodrigo, 13/11/2026): Ana Paula e Thaís. Modelo de todos fica "indefinido".
INSERT INTO "agenda_pessoa" ("usuario_id", "validadora") SELECT "id", true FROM "usuario" WHERE lower("email") IN ('anapaula.zambetti@rucelle.com.br', 'thais.valle@rucelle.com.br') ON CONFLICT ("usuario_id") DO UPDATE SET "validadora" = true;--> statement-breakpoint
-- Feriados nacionais de data fixa até o início de 2027 (os demais a gestão cadastra na tela Feriados)
INSERT INTO "agenda_feriado" ("data", "nome", "abrangencia") VALUES ('2026-11-15', 'Proclamação da República', 'nacional'), ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'), ('2026-12-25', 'Natal', 'nacional'), ('2027-01-01', 'Confraternização Universal', 'nacional');
