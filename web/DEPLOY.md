# Architecture 360 — Publicação no Railway (preparação)

Estado: **publicado em 05/11/2026** com autorização expressa de Rodrigo. Projeto Railway `architecture-360` (ID 0a80cf58-decc-4d2a-9a26-76c369c5f1ed), serviços `architecture-360` (web) e `Postgres`. Domínio gerado: https://architecture-360-production.up.railway.app (não divulgar). Primeiro administrador: ainda não criado (seção 7).

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
| `PORT` | definida pelo Railway (**8080** neste serviço) | o start usa `-p ${PORT}`; o domínio gerado deve apontar para a mesma porta (foi ajustado de 3000 para 8080 no deploy) |

Não há chaves de terceiros: o sistema não chama APIs externas (Vobi é lido só por CSV exportado manualmente).

## 3. Banco e migrações

- Esquema versionado em `drizzle/*.sql` (gerado por `drizzle-kit generate`).
- Em produção as migrações rodam **no start** (`npm run start:railway` → `node scripts/migrate.mjs && next start`), com dependências de runtime apenas; são idempotentes (tabela `drizzle.__drizzle_migrations`).
- Backups: **no plano Hobby (atual) o Railway não cria backups** do volume do Postgres — a aba Backups informa que backups manuais, agendados e point-in-time exigem o plano Pro (verificado em 05/11/2026). Enquanto isso, a proteção é: os CSVs originais ficam guardados no Drive e qualquer carga pode ser refeita a partir deles; e recomenda-se um `pg_dump` periódico guardado no Drive (rotina a definir; não implementada). Decisão pendente: migrar para Pro ou aceitar a rotina de dump.
- Persistência: o volume do Postgres é persistente; o serviço `web` é sem estado.

## 4. Segurança e acesso

- Login individual por usuário/senha (bcrypt), sessão em tabela com cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção.
- Sem cadastro público: usuários são criados só pelo script (seção 6) por quem tem acesso ao projeto Railway.
- Perfis `admin`, `gestao`, `coordenacao`, `arquiteta`; autorização no servidor em toda página e ação. Sem sessão, todas as rotas gerenciais redirecionam para `/login` (verificado em build de produção); `/api/health` responde só `{ok}`.
- HTTPS: fornecido pelo Railway no domínio gerado (`*.up.railway.app`). Domínio próprio (ex.: `a360.rucelle.com.br`) é opcional e exige um CNAME no DNS da Rucelle; **não configurar até autorização**.
- O domínio gerado é público na Internet, mas sem login não há acesso a nada além da tela de entrada. Se a direção quiser restringir ainda mais, a alternativa simples é manter o domínio sem divulgação; SSO ou VPN não são necessários agora.

## 5. Custo (observado em 05/11/2026 e estimativa)

Conta no plano **Hobby** (US$ 5/mês com US$ 5 de uso incluídos; limites de 8 GB RAM / 8 vCPU / 100 GB de disco compartilhado). Uso do ciclo 17/10–17/11 com os três projetos (upbeat-growth, rucelle-360 e architecture-360): **US$ 1,64**, abaixo do incluído. Estimativa anterior:

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

O Postgres **não tem acesso público** (só rede privada do Railway), então o script precisa rodar de dentro do serviço `web`. No computador do Rodrigo, com o Railway CLI autenticado e vinculado ao projeto `architecture-360`, serviço `architecture-360`:

```
railway login
railway link          # escolher o projeto architecture-360 e o serviço architecture-360
railway ssh           # abre um shell dentro do contêiner do serviço web
node scripts/criar-usuario.mjs "Rodrigo Carneiro" rodrigo.carneiro@rucelle.com.br admin
exit
```

O script pede a senha no terminal **sem exibir os caracteres** (duas vezes), exige ao menos 10 caracteres e grava só o hash. A senha nunca passa por argumento de linha de comando, histórico, logs ou documentação. Acredito que `railway ssh` existe nas versões recentes do CLI; se o seu não tiver, atualize-o (`npm i -g @railway/cli`) — você deve verificar.

Alternativa se `railway ssh` não estiver disponível: habilitar temporariamente *Public access* no serviço Postgres, rodar localmente `DATABASE_URL="<DATABASE_PUBLIC_URL do Postgres>" node web/scripts/criar-usuario.mjs ...` e **remover o acesso público em seguida**.

Demais usuários (gestão, coordenação, arquitetas): mesmo comando com o perfil correspondente. Troca de senha pelo próprio usuário ainda não existe (pendência).

## 8. Pendências reais para publicar

1. Autorização expressa de Rodrigo para o deploy (cria infraestrutura paga).
2. Confirmar o plano/cobrança da conta Railway.
3. Decidir se haverá domínio próprio (CNAME) ou só o domínio gerado.
4. Confirmar a política de backup do Postgres no plano contratado.
5. Definir quem receberá os perfis `gestao` e `coordenacao` e quais arquitetas terão acesso.
