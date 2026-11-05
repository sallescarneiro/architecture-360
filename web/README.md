# Architecture 360 — aplicação web

Next.js 15 (App Router) · Drizzle ORM · PostgreSQL · autenticação por usuário/senha com sessão no servidor.

## Rodar localmente
1. PostgreSQL 16 disponível (local). Crie o banco `a360`.
2. `cp .env.example .env.local` e ajuste `DATABASE_URL`.
3. `npm install`
4. `npm run db:migrate` (aplica `drizzle/*.sql`)
5. `npm run usuario -- "Nome" email@rucelle.com.br admin` (perfis: admin, gestao, coordenacao, arquiteta); a senha é pedida de forma oculta
6. `npm run dev` e abra http://localhost:3000

## Módulos
- `/importacao` — upload dos CSVs do Vobi (Projetos e Tarefas), prévia com resumo e anomalias, confirmação em transação única, histórico de cargas. Somente admin e gestão importam.
- `/qualidade` — tarefas por classe de completude, alertas, etapas não mapeadas, pessoas sem e-mail, colisões, órfãs, não encontradas; visão "Dados incompletos na fonte" por projeto e por arquiteta, como contexto gerencial (sem tarefas, cobranças ou notificações); links para o Vobi só para consulta. Arquiteta vê só os próprios dados.
- `/` Operação — indicadores suportados pelos dados, cada um com selo de cobertura, e recomendações gerenciais calculadas (concentração, padrão de atraso, gargalo por etapa, refação, limitação dos dados) visíveis para gestão e coordenação. Sem ranking, nota ou eficiência individual.
- `/pessoas` — mapeamento nome no Vobi → e-mail @rucelle (chave comum com o People).

## Código principal
- `src/lib/importador/normalizacao.ts` — layouts v1, sinônimos de etapas, semente de pessoas, normalização.
- `src/lib/importador/importador.ts` — leitura/validação dos CSVs e execução da carga (prévia desfaz, aplicar grava), porte da PoC em Python.
- `src/db/schema.ts` — tabelas: usuario, sessao, carga, bruto_projeto, bruto_tarefa, pessoa_vobi, projeto, tarefa, historico_alteracoes, alerta.
- `src/lib/auth.ts` — sessões e perfis; autorização no servidor.

Dados reais, bancos e `.env.local` não são versionados. Publicação no Railway: ver `DEPLOY.md`.
