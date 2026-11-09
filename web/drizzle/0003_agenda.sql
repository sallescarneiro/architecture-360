CREATE TABLE "conexao_agenda" (
	"usuario_id" integer PRIMARY KEY NOT NULL,
	"email_google" text,
	"refresh_token_cifrado" text,
	"access_token_cifrado" text,
	"access_expira_em" timestamp with time zone,
	"estado" text DEFAULT 'conectada' NOT NULL,
	"erro" text,
	"conectado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_sinc_em" timestamp with time zone,
	"ultima_sinc_ok_em" timestamp with time zone,
	"eventos" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evento_agenda" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"google_id" text NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"dia_inteiro" boolean DEFAULT false NOT NULL,
	"privado" boolean DEFAULT false NOT NULL,
	"titulo" text,
	"local" text,
	"participantes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"externos" integer DEFAULT 0 NOT NULL,
	"meet_link" text,
	"html_link" text,
	"status" text,
	"atualizado_google_em" timestamp with time zone,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conexao_agenda" ADD CONSTRAINT "conexao_agenda_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD CONSTRAINT "evento_agenda_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evento_agenda_usuario_google_uq" ON "evento_agenda" USING btree ("usuario_id","google_id");--> statement-breakpoint
CREATE INDEX "evento_agenda_usuario_inicio_idx" ON "evento_agenda" USING btree ("usuario_id","inicio");