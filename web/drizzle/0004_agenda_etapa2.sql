CREATE TABLE "agenda_acao" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"acao" text NOT NULL,
	"calendario_id" text,
	"google_id" text,
	"resultado" text NOT NULL,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conexao_agenda" ADD COLUMN "escopos" text;--> statement-breakpoint
ALTER TABLE "conexao_agenda" ADD COLUMN "calendarios" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "calendario_id" text DEFAULT 'primary' NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "descricao" text;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "organizador_email" text;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "sou_organizador" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "recorrente_de" text;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "tipo" text DEFAULT 'outro' NOT NULL;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "projeto_codigo" integer;--> statement-breakpoint
ALTER TABLE "evento_agenda" ADD COLUMN "projeto_origem" text;--> statement-breakpoint
ALTER TABLE "agenda_acao" ADD CONSTRAINT "agenda_acao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;