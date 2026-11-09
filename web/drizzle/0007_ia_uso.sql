CREATE TABLE "ia_uso" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"referencia" text,
	"modelo" text,
	"tokens_entrada" integer,
	"tokens_saida" integer,
	"custo_estimado_usd" real,
	"duracao_ms" integer,
	"estado" text NOT NULL,
	"erro" text,
	"http_status" integer,
	"detalhes" jsonb,
	"usuario_id" integer,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ia_uso" ADD CONSTRAINT "ia_uso_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_uso_quando_idx" ON "ia_uso" USING btree ("quando");