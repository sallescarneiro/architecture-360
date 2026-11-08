CREATE TABLE "cliente_vobi" (
	"codigo" integer PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"chave_nome" text NOT NULL,
	"razao_social" text,
	"tipo" text,
	"status" text,
	"email" text,
	"telefone" text,
	"cidade" text,
	"estado" text,
	"criado_em_vobi" text,
	"origem" text DEFAULT 'vobi' NOT NULL,
	"primeira_carga" integer NOT NULL,
	"ultima_carga" integer NOT NULL,
	"nao_encontrado_desde" integer,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vinculo_cliente_manual" (
	"projeto_codigo" integer PRIMARY KEY NOT NULL,
	"cliente_codigo" integer NOT NULL,
	"chave_nome_csv" text NOT NULL,
	"decidido_por_id" integer,
	"decidido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"observacao" text
);
--> statement-breakpoint
ALTER TABLE "carga" ADD COLUMN "tipo" text DEFAULT 'operacao' NOT NULL;--> statement-breakpoint
ALTER TABLE "carga" ADD COLUMN "arq_clientes" text;--> statement-breakpoint
ALTER TABLE "carga" ADD COLUMN "hash_clientes" text;--> statement-breakpoint
ALTER TABLE "carga" ADD COLUMN "linhas_clientes" integer;--> statement-breakpoint
ALTER TABLE "carga" ADD COLUMN "conteudo_clientes" "bytea";--> statement-breakpoint
ALTER TABLE "projeto" ADD COLUMN "cliente_codigo" integer;--> statement-breakpoint
ALTER TABLE "projeto" ADD COLUMN "vinculo_cliente_status" text DEFAULT 'sem_cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "vinculo_cliente_manual" ADD CONSTRAINT "vinculo_cliente_manual_decidido_por_id_usuario_id_fk" FOREIGN KEY ("decidido_por_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cliente_vobi_chave_nome_idx" ON "cliente_vobi" USING btree ("chave_nome");--> statement-breakpoint
CREATE INDEX "projeto_cliente_idx" ON "projeto" USING btree ("cliente_codigo");