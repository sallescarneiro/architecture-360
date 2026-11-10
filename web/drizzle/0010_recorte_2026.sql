CREATE TABLE "projeto_arquivado" (
	"codigo" integer PRIMARY KEY NOT NULL,
	"dados" jsonb NOT NULL,
	"arquivado_na_carga" integer NOT NULL,
	"arquivado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarefa_arquivada" (
	"chave" text PRIMARY KEY NOT NULL,
	"projeto_codigo" integer,
	"dados" jsonb NOT NULL,
	"arquivado_na_carga" integer NOT NULL,
	"arquivado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tarefa_arquivada_projeto_idx" ON "tarefa_arquivada" USING btree ("projeto_codigo");--> statement-breakpoint
-- Recorte 2026 (T-210, decisão de 10/11/2026): move para o arquivo os projetos encerrados (Finalizado/Cancelado) criados antes de 2026 e as tarefas deles. Nada é apagado: o registro completo fica em "dados".
INSERT INTO "tarefa_arquivada" ("chave", "projeto_codigo", "dados", "arquivado_na_carga")
SELECT t."chave", t."projeto_codigo", to_jsonb(t), coalesce((SELECT max("id") FROM "carga" WHERE "status" = 'aceita'), 0)
FROM "tarefa" t JOIN "projeto" p ON p."codigo" = t."projeto_codigo"
WHERE p."status_classe" = 'encerrado' AND (p."criado_em" IS NULL OR p."criado_em" < '2026-01-01')
ON CONFLICT ("chave") DO NOTHING;
--> statement-breakpoint
INSERT INTO "projeto_arquivado" ("codigo", "dados", "arquivado_na_carga")
SELECT p."codigo", to_jsonb(p), coalesce((SELECT max("id") FROM "carga" WHERE "status" = 'aceita'), 0)
FROM "projeto" p
WHERE p."status_classe" = 'encerrado' AND (p."criado_em" IS NULL OR p."criado_em" < '2026-01-01')
ON CONFLICT ("codigo") DO NOTHING;
--> statement-breakpoint
DELETE FROM "tarefa" WHERE "projeto_codigo" IN (SELECT "codigo" FROM "projeto_arquivado");
--> statement-breakpoint
DELETE FROM "projeto" WHERE "codigo" IN (SELECT "codigo" FROM "projeto_arquivado");
