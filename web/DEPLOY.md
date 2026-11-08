# Architecture 360 — Publicação no Railway (preparação)

Estado: **publicado em 05/11/2026** com autorização expressa de Rodrigo. Projeto Railway `architecture-360` (ID 0a80cf58-decc-4d2a-9a26-76c369c5f1ed), serviços `architecture-360` (web) e `Postgres`. Domínio gerado: https://architecture-360-production.up.railway.app (não divulgar). Primeiro administrador: ainda não criado (seção 7).

## 1. Arquitetura recomendada

Um projeto Railway próprio (`architecture-360`, separado da Central de Operações e do rucelle-360) com dois serviços:

| Serviço | O que é | Observações |
| --- | --- | --- |
| `web` | Next.js 15 (este diretório `web/`), builder **Railpack** (padrão do Railway), 1 réplica | Root Directory = `web`. **Start Command e Healthcheck Path são definidos nas Settings do serviço** (`npm run start:railway` e `/api/health`): o Railway descontinuou o Config-as-code (`railway.json`) e deixou de aplicá-lo — detectado e corrigido em 08/11/2026 (T-181). O start aplica as migrações e sobe o Next. |
| `Postgres` | PostgreSQL gerenciado do Railway (plugin oficial) | Volume persistente criado pelo Railway. `DATABASE_URL` entregue por referência ao serviço `web`. |

Sem workers, sem filas, sem armazenamento de arquivos: os CSVs ficam no banco só enquanto uma prévia aguarda confirmação e são apagados ao confirmar/descartar.

## 2. Variáveis de ambiente do serviço `web` (sem valores secretos)

| Variável | Valor | Origem |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referência ao serviço Postgres (Railway injeta) |
| `SESSION_DIAS` | `7` | validade da sessão |
| `NODE_ENV` | `production` | Railway define no build/start; ativa o cookie `Secure` |
| `PEOPLE_URL` / `PEOPLE_EXPORT_PATH` / `PEOPLE_TOKEN` | **ainda não definidas** | integração de leitura com o People (seção 9); sem elas a hierarquia é "dado ausente" |
| `EXPORT_TOKEN` | **ainda não definida** | liga `GET /api/export/operacao` para o Rucelle 360° (seção 9); vazia = endpoint desligado (503) |
| `PORT` | definida pelo Railway (**8080** neste serviço) | o start usa `-p ${PORT}`; o domínio gerado deve apontar para a mesma porta (foi ajustado de 3000 para 8080 no deploy) |

Vobi é lido só por CSV exportado manualmente (nunca por API). As únicas chaves são os tokens entre plataformas Rucelle acima, definidos só no Railway.

## 3. Banco e migrações

- Esquema versionado em `drizzle/*.sql` (gerado por `drizzle-kit generate`).
- Em produção as migrações rodam **no start** (`npm run start:railway` → `node scripts/migrate.mjs && next start`), com dependências de runtime apenas; são idempotentes (tabela `drizzle.__drizzle_migrations`).
- Backups: **no plano Hobby (atual) o Railway não cria backups** do volume do Postgres (Pro exigido, verificado em 05/11/2026). Decisão: manter Hobby e usar a rotina própria em `backup/` (serviço cron `backup` no mesmo projeto, imagem ghcr: `pg_dump` 18 → criptografia com chave pública → Drive compartilhado "A360 Backups (restrito)"; retenção 30 dias + mensal 12 meses; **ativa desde 06/11/2026**, primeiro backup real às 08:48 BRT). Procedimento, variáveis e restauração em `backup/README.md`. Os CSVs originais do Vobi ficam no Drive e qualquer carga pode ser refeita a partir deles.
- Persistência: o volume do Postgres é persistente; o serviço `web` é sem estado.
- Migração `0002_clientes_vobi` (08/11/2026): tabelas `cliente_vobi` e `vinculo_cliente_manual`; colunas `carga.tipo/arq_clientes/hash_clientes/linhas_clientes/conteudo_clientes` e `projeto.cliente_codigo/vinculo_cliente_status`. Só adiciona (não altera dados existentes); reversão manual em `drizzle/reversao/0002_clientes_vobi.down.sql`.
- Clientes do Vobi: exportação **Cadastros › Contatos › Clientes › Ações › Exportar CSV** enviada na tela Importação (campo opcional, junto com Projetos+Tarefas ou sozinha). Só entram código, nome, razão social, tipo, status, e-mail, telefone, cidade/UF e data de criação; CPF/CNPJ, RG/IE, nascimento, endereço e observações são descartados na leitura (nem o conteúdo temporário da prévia os contém). Nenhum cliente é apagado quando falta numa exportação. Vínculo projeto × cliente pelo nome normalizado; ambiguidades ficam na fila de `/clientes` para decisão da coordenação (nunca automática).

## 4. Segurança e acesso

- Login individual por usuário/senha (bcrypt), sessão em tabela com cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção.
- Sem cadastro público: usuários são criados só pelo script (seção 6) por quem tem acesso ao projeto Railway.
- **Acesso atual (decisão de 05/11/2026): somente Rodrigo Carneiro, perfil `admin`.** Nenhum outro usuário é criado; gestores, coordenadores e arquitetas não têm acesso. Os perfis `gestao`/`coordenacao`/`arquiteta` existem só como regra de autorização no código, para uso futuro, se e quando a direção decidir.
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
2. No serviço criado, **Settings → Root Directory** = `web`; **Settings → Deploy → Custom Start Command** = `npm run start:railway`; **Healthcheck Path** = `/api/health`. (O `railway.json` fica no repositório só como referência; o Railway não o aplica mais.)
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

Demais usuários: **não criar** nesta etapa (acesso exclusivo do administrador). Quando a direção liberar, é o mesmo comando com o perfil correspondente. Troca de senha pelo próprio usuário ainda não existe (pendência).

## 8. Pendências reais para publicar

1. Autorização expressa de Rodrigo para o deploy (cria infraestrutura paga).
2. Confirmar o plano/cobrança da conta Railway.
3. Decidir se haverá domínio próprio (CNAME) ou só o domínio gerado.
4. Confirmar a política de backup do Postgres no plano contratado.
5. (Decidido em 05/11/2026: acesso só do administrador; sem outros usuários por ora.)

## 9. Integrações entre plataformas Rucelle (preparadas, não ativas)

Padrão único, o mesmo já usado entre a Central de Operações e o People: endpoint HTTP de exportação em JSON protegido pelo cabeçalho `x-admin-key` (token em variável de ambiente, comparação em tempo constante). Nada de webhooks, filas ou acesso direto a banco.

| Fluxo | Papel do A360 | Como | Estado |
| --- | --- | --- | --- |
| People → A360 (hierarquia, cargos, vínculos) | consumidor | `GET {PEOPLE_URL}{PEOPLE_EXPORT_PATH}` com `x-admin-key: PEOPLE_TOKEN`; espelho somente leitura em `pessoa_people` (origem + data), botão "Atualizar do People" (admin) | **pendente**: o People ainda não expõe esse endpoint (código do People fora do GitHub, Painel T-112). Até lá: "dado ausente". |
| Vobi → A360 | leitor | CSV exportado manualmente (Importação Vobi) | ativo (sem carga real ainda) |
| A360 → Rucelle 360° (indicadores, cobertura, recomendações, limitações) | fornecedor | `GET /api/export/operacao` com `x-admin-key: EXPORT_TOKEN`; contrato `a360.operacao.v1` em `src/lib/contratos/a360-v1.ts` | **preparado, desligado** (sem `EXPORT_TOKEN` → 503). Só agregados; nunca dados por pessoa. |

Organização do código para a integração futura (seção 6 do prompt de 05/11/2026): `src/lib/importador` (dados originais do Vobi) · `src/lib/servicos` (regras e indicadores, usados pela tela e pelo endpoint) · `src/lib/contratos` (contratos versionados) · `src/lib/integracoes` (clientes de outras plataformas) · `src/app` (camada visual, só apresenta). Toda informação exportada carrega `origem` (vobi/people/a360), `natureza` (original/calculado/inferencia_ia — este último reservado, sem uso) e `dataReferencia` (data da exportação do Vobi). Identificadores: projeto = Código do Vobi; pessoa = e-mail @rucelle; carga = id sequencial.

Para ligar a exportação ao Rucelle 360°: definir `EXPORT_TOKEN` no serviço `web` (valor gerado, nunca versionado) e o mesmo valor no consumidor; confirmar o formato com os padrões atuais do Rucelle 360° antes.
