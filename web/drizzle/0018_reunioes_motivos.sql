CREATE TABLE "reuniao_motivo_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"motivo_id" integer,
	"acao" text NOT NULL,
	"motivo_nome" text NOT NULL,
	"usuario_id" integer,
	"quando" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reuniao_motivo" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"chave" text NOT NULL,
	"ordem" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reuniao_transcricao" ALTER COLUMN "conteudo" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "motivo_id" integer;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "origem" text;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "gravacao_url" text;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "gravacao_plataforma" text;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "gravacao_data" text;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "gravacao_duracao_min" integer;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "aviso_gravacao_forma" text;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "aviso_gravacao_por" integer;--> statement-breakpoint
ALTER TABLE "reuniao" ADD COLUMN "aviso_gravacao_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reuniao_transcricao" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "reuniao_transcricao" ADD COLUMN "link_original" text;--> statement-breakpoint
ALTER TABLE "reuniao_transcricao" ADD COLUMN "entrada" text;--> statement-breakpoint
ALTER TABLE "reuniao_motivo_historico" ADD CONSTRAINT "reuniao_motivo_historico_motivo_id_reuniao_motivo_id_fk" FOREIGN KEY ("motivo_id") REFERENCES "public"."reuniao_motivo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reuniao_motivo_historico" ADD CONSTRAINT "reuniao_motivo_historico_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reuniao_motivo_chave_uq" ON "reuniao_motivo" USING btree ("chave");--> statement-breakpoint
-- T-227: lista inicial de motivos (definida por Rodrigo em 13/11/2026) e registro no histórico
INSERT INTO "reuniao_motivo" ("nome", "chave", "ordem") VALUES
  ('Reunião de Onboarding', 'reunião de onboarding', 1),
  ('Reunião de Programa de Necessidades (PN)', 'reunião de programa de necessidades (pn)', 2),
  ('Reunião de Apresentação de Layout e Moodboard', 'reunião de apresentação de layout e moodboard', 3),
  ('Reunião de Apresentação de Imagens 3D', 'reunião de apresentação de imagens 3d', 4),
  ('Reunião de Apresentação de Projeto Executivo', 'reunião de apresentação de projeto executivo', 5),
  ('Reunião de Alinhamento de Etapas', 'reunião de alinhamento de etapas', 6),
  ('Reunião de Revisão', 'reunião de revisão', 7),
  ('Reunião de Validação e Aprovação', 'reunião de validação e aprovação', 8),
  ('Reunião de Solicitação de Alteração', 'reunião de solicitação de alteração', 9),
  ('Reunião de Compatibilização', 'reunião de compatibilização', 10),
  ('Reunião de Acompanhamento de Obra', 'reunião de acompanhamento de obra', 11),
  ('Reunião de Entrega', 'reunião de entrega', 12),
  ('Reunião de Pós-entrega', 'reunião de pós-entrega', 13),
  ('Reunião de Alinhamento Interno', 'reunião de alinhamento interno', 14),
  ('Outros', 'outros', 15)
ON CONFLICT ("chave") DO NOTHING;--> statement-breakpoint
INSERT INTO "reuniao_motivo_historico" ("motivo_id", "acao", "motivo_nome") SELECT "id", 'lista_inicial', "nome" FROM "reuniao_motivo";
