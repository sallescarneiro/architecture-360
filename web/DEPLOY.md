# Architecture 360 — Publicação no Railway (preparação)

Estado: **preparado, não publicado**. Nenhum serviço foi criado no Railway. O deploy depende de autorização expressa.

## 1. Arquitetura recomendada

Um projeto Railway próprio (`architecture-360`, separado da Central de Operações e do rucelle-360) com dois serviços:

| Serviço | O que é | Observações |
| --- | --- | --- |
| `web` | Next.js 15 (este diretório `web/`), build Nixpacks, 1 réplica | Root Directory = `web`. Start aplica as migrações e sobe o Next. Health check em `/api/health`. |
| `Postgres` | PostgreSQL gerenciado do Railway (plugin oficial) | Volume persistente criado pelo Railway. `DATABASE_URL` entregue por referência ao serviço `web`. |

Sem workers, sem filas, sem armazenamento de arquivos: os CSVs ficam no banco só enquanto uma prévia aguarda confirmação e são apagados ao confirmar/descartar.

## 2. Variáveis de ambiente do serviço `web` (sem valores secretos)

| Variável | Valor | Origem |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referência ao serviço Postgres (Railway injeta) |
| `SESSION_DIAS` | `7` | validade da sessão |
| `NODE_ENV` | `production` | Railway define no build/start; ativa o cookie `Secure` |
| `PORT` | definida pelo Railway | o start usa `-p ${PORT}` |

Não há chaves de terceiros: o sistema não chama APIs externas (Vobi é lido só por CSV exportado manualmente).

## 3. Banco e migrações

- Esquema versionado em `drizzle/*.sql` (gerado por `drizzle-kit generate`).
- Em produção as migrações rodam **no start** (`npm run start:railway` → `node scripts/migrate.mjs && next start`), com dependências de runtime apenas; são idempotentes (tabela `drizzle.__drizzle_migrations`).
- Backups: o Railway oferece backups de volume para o Postgres gerenciado — **confirmar no painel do projeto qual frequência e retenção valem no plano contratado** (não verificado nesta preparação). Independente disso, recomenda-se um `pg_dump` periódico guardado no Drive da Rucelle (rotina a definir; não implementada).
- Persistência: o volume do Postgres é persistente; o serviço `web` é sem estado.

## 4. Segurança e acesso

- Login individual por usuário/senha (bcrypt), sessão em tabela com cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção.
- Sem cadastro público: usuários são criados só pelo script (seção 6) por quem tem acesso ao projeto Railway.
- Perfis `admin`, `gestao`, `coordenacao`, `arquiteta`; autorização no servidor em toda página e ação. Sem sessão, todas as rotas gerenciais redirecionam para `/login` (verificado em build de produção); `/api/health` responde só `{ok}`.
- HTTPS: fornecido pelo Railway no domínio gerado (`*.up.railway.app`). Domínio próprio (ex.: `a360.rucelle.com.br`) é opcional e exige um CNAME no DNS da Rucelle; **não configurar até autorização**.
- O domínio gerado é público na Internet, mas sem login não há acesso a nada além da tela de entrada. Se a direção quiser restringir ainda mais, a alternativa simples é manter o domínio sem divulgação; SSO ou VPN não são necessários agora.

## 5. Estimativa de custo mensal (estimativa, não cotação)

Preços de lista da Railway lidos em 23/10/2026 (Levantamento de Infraestrutura v0.1): plano Hobby US$ 5/mês com US$ 5 de uso incluídos; uso ≈ US$ 10 por GB de RAM-mês e ≈ US$ 20 por vCPU-mês; volume ≈ US$ 0,16 por GB-mês; saída ≈ US$ 0,05/GB.

| Item | Hipótese | US$/mês |
| --- | --- | --- |
| `web` | ~0,5 GB RAM média, CPU baixa (uso interno, ~15 pessoas) | 5–10 |
| `Postgres` | ~0,3 GB RAM, volume 1 GB | 3–6 |
| Saída de dados | desprezível | ~0 |
| **Total estimado** | | **≈ US$ 8–16 (≈ R$ 40–80 a R$ 5,04)** |

Você deve verificar: o plano atual da conta Railway (a Central foi criada em trial em 17/10/2026; pendência registrada no P22), a calculadora de preços da Railway e se o projeto novo entra na mesma cobrança. Impostos sobre serviço estrangeiro não estão incluídos.

## 6. Procedimento de deploy (executar só com autorização)

Pré-requisitos: acesso ao Railway e ao GitHub `sallescarneiro/architecture-360`; Railway CLI instalado localmente (`npm i -g @railway/cli`) para a criação do primeiro admin.

1. **Criar o projeto** no Railway: *New Project → Deploy from GitHub repo* → `sallescarneiro/architecture-360`.
2. No serviço criado, **Settings → Root Directory** = `web`. O `railway.json` do diretório define build, start e health check.
3. **Adicionar o Postgres**: *+ New → Database → PostgreSQL*.
4. No serviço `web`, **Variables**: `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `SESSION_DIAS` = `7`.
5. Fazer o deploy (o Railway inicia sozinho após as variáveis). Aguardar o health check verde: o start já aplicou as migrações.
6. **Domínio**: *Settings → Networking → Generate Domain* (HTTPS automático). Não divulgar ainda.
7. **Primeiro administrador** (seção 7).
8. Entrar com o admin, abrir *Importação Vobi* e só então fazer a primeira carga real, pela interface, com os CSVs exportados do Vobi naquele dia (nunca os CSVs do repositório/da PoC).

## 7. Primeiro administrador (sem expor a senha)

No computador do Rodrigo, com o Railway CLI autenticado e o projeto vinculado (`railway login`, `railway link`):

```
cd web
railway run node scripts/criar-usuario.mjs "Rodrigo Carneiro" rodrigo.carneiro@rucelle.com.br admin
```

O script pede a senha no terminal **sem exibir os caracteres** (duas vezes), exige ao menos 10 caracteres e grava só o hash. A senha nunca passa por argumento de linha de comando, histórico, logs ou documentação. `railway run` injeta a `DATABASE_URL` do projeto; nada fica salvo localmente.

Alternativa sem CLI: abrir um shell do serviço `web` no painel do Railway e rodar o mesmo comando com `USUARIO_SENHA` definida só naquela sessão (a variável não é impressa).

Demais usuários (gestão, coordenação, arquitetas): mesmo comando com o perfil correspondente. Troca de senha pelo próprio usuário ainda não existe (pendência).

## 8. Pendências reais para publicar

1. Autorização expressa de Rodrigo para o deploy (cria infraestrutura paga).
2. Confirmar o plano/cobrança da conta Railway.
3. Decidir se haverá domínio próprio (CNAME) ou só o domínio gerado.
4. Confirmar a política de backup do Postgres no plano contratado.
5. Definir quem receberá os perfis `gestao` e `coordenacao` e quais arquitetas terão acesso.
