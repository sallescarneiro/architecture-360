CREATE TABLE "pessoa_people" (
	"email" text PRIMARY KEY NOT NULL,
	"id_people" text,
	"nome" text NOT NULL,
	"cargo" text,
	"funcao" text,
	"equipe" text,
	"gestor_email" text,
	"coordenador_email" text,
	"ativo" boolean,
	"atualizado_em_people" timestamp with time zone,
	"sincronizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"origem" text DEFAULT 'people' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sincronizacao_people" (
	"id" serial PRIMARY KEY NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"pessoas" integer,
	"motivo" text,
	"por_id" integer
);
--> statement-breakpoint
ALTER TABLE "sincronizacao_people" ADD CONSTRAINT "sincronizacao_people_por_id_usuario_id_fk" FOREIGN KEY ("por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;