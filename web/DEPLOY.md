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
- Regra única de prazo (T-196, 08/11/2026): `src/lib/prazo.ts` (`statusPrazo` + `sqlStatusPrazo`), 9 status mutuamente exclusivos, calculada na data real (fuso America/Sao_Paulo); Panorama, Meu Dia, Tarefas, Projetos e detalhe do projeto usam a mesma função. Consequência documentada: o Panorama contava "vencidas" na data da exportação (54 na carga 1); agora conta atrasadas na data de hoje (75 em 08/11) — a diferença é só a data de referência, não os dados. Concluídas/canceladas nunca entram no atraso; "sem prazo" nunca é "no prazo".
- Visual (T-196): chrome do Rucelle 360 (topo branco fixo, lateral branca, nude, Montserrat única), marca "RUCELLE 360° / Architecture 360 · Central de Trabalho"; listas `/tarefas` e `/projetos` com filtros na URL, busca sem acento, ordenação e paginação; KPIs clicáveis.
- Central de Trabalho / Meu Dia (Fase 2, 08/11/2026): `/meu-dia` é a página inicial por perfil (arquiteta, coordenação, gerência); a antiga Operação está em `/panorama`. Só dados importados; prazos comparados com a data real; aviso de desatualização acima de 4 dias (cadência combinada: 2 cargas por semana). Blocos sem fonte (agenda, reuniões, espera por cliente, arquivos) aparecem como indisponíveis. Sem ranking ou avaliação individual.
- Clientes do Vobi: exportação **Cadastros › Contatos › Clientes › Ações › Exportar CSV** enviada na tela Importação (campo opcional, junto com Projetos+Tarefas ou sozinha). Só entram código, nome, razão social, tipo, status, e-mail, telefone, cidade/UF e data de criação; CPF/CNPJ, RG/IE, nascimento, endereço e observações são descartados na leitura (nem o conteúdo temporário da prévia os contém). Nenhum cliente é apagado quando falta numa exportação. Vínculo projeto × cliente pelo nome normalizado; ambiguidades ficam na fila de `/clientes` para decisão da coordenação (nunca automática).

## 4. Segurança e acesso

- Login individual por usuário/senha (bcrypt), sessão em tabela com cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção.
- Sem cadastro público: usuários são criados pelo administrador na tela `/usuarios` (T-205) ou, para o primeiro administrador, pelo script (seção 7).
- **Acesso (decisão de 10/11/2026, revogando a de 05/11):** a equipe de arquitetura tem acesso com perfil definido pela direção — Rodrigo e Flavia `admin`; Thais `gestao`; Ana Paula `coordenacao`; as arquitetas `arquiteta`. A senha provisória é mostrada uma vez ao administrador, que a entrega pessoalmente (não há e-mail automático); a pessoa é obrigada a trocá-la no primeiro acesso (`/conta/senha`).
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

Demais usuários: pela tela `/usuarios` (só admin), sem Railway. Troca da própria senha em `/conta/senha` (botão "Senha" no topo).

## 8. Estado da publicação (10/11/2026) e pendências que dependem da direção

Publicado e operacional em produção (Railway, `architecture-360-production.up.railway.app`): login por usuário e senha com troca obrigatória no primeiro acesso; perfis admin/gestão/coordenação/arquiteta verificados no servidor; importação Vobi (CSV, só leitura); Meu Dia; Painel de Gestão (com divergências, limitações e entregáveis); Tarefas, Projetos (detalhe com reuniões, entregáveis, alertas, flags) e linha do tempo; Agenda (OAuth por usuário, leitura e escrita no Google Calendar da própria pessoa); Reuniões com transcrição e ata por IA (chamada real validada em 09/11); Alertas e flags; Capacidade e fluxo; Entregáveis e aprovações; Qualidade dos dados; Clientes; Pessoas; Usuários; cobertura da integração.

Dependem da direção (não são código):
1. Entregar as senhas provisórias à equipe (13 acessos criados em 10/11; só o administrador entrou até agora).
2. Manter a cadência de exportação do Vobi (2× por semana): a última carga de operação é de 05/11/2026.
3. Integração com o People: o People precisa expor `GET /api/export/pessoas` com `x-admin-key`; depois definir `PEOPLE_URL`, `PEOPLE_TOKEN` (e `PEOPLE_EXPORT_PATH` se diferente) no Railway. Até lá a hierarquia é "dado ausente".
4. Classificar as etapas do Vobi ainda não mapeadas (ex.: "ESTUDO VOLUMÉTRICO", "Reunião apresentação", "ENTREGA PROJETO COMPLETO", "Refação 3D", "VÍDEO") na tabela de sinônimos — decisão da gestão, pois afeta refação e entregas.
5. Cada pessoa conectar a própria Google Agenda em /agenda (OAuth individual).
6. Domínio próprio (CNAME) e política de backup do Postgres no plano Railway (decisões de 05/11 ainda em aberto).

## 9. Integrações entre plataformas Rucelle (preparadas, não ativas)

Padrão único, o mesmo já usado entre a Central de Operações e o People: endpoint HTTP de exportação em JSON protegido pelo cabeçalho `x-admin-key` (token em variável de ambiente, comparação em tempo constante). Nada de webhooks, filas ou acesso direto a banco.

| Fluxo | Papel do A360 | Como | Estado |
| --- | --- | --- | --- |
| People → A360 (hierarquia, cargos, vínculos) | consumidor | `GET {PEOPLE_URL}{PEOPLE_EXPORT_PATH}` com `x-admin-key: PEOPLE_TOKEN`; espelho somente leitura em `pessoa_people` (origem + data), botão "Atualizar do People" (admin) | **pendente**: o People ainda não expõe esse endpoint (código do People fora do GitHub, Painel T-112). Até lá: "dado ausente". |
| Vobi → A360 | leitor | CSV exportado manualmente (Importação Vobi) | ativo (sem carga real ainda) |
| A360 → Rucelle 360° (indicadores, cobertura, recomendações, limitações) | fornecedor | `GET /api/export/operacao` com `x-admin-key: EXPORT_TOKEN`; contrato `a360.operacao.v1` em `src/lib/contratos/a360-v1.ts` | **preparado, desligado** (sem `EXPORT_TOKEN` → 503). Só agregados; nunca dados por pessoa. |

Organização do código para a integração futura (seção 6 do prompt de 05/11/2026): `src/lib/importador` (dados originais do Vobi) · `src/lib/servicos` (regras e indicadores, usados pela tela e pelo endpoint) · `src/lib/contratos` (contratos versionados) · `src/lib/integracoes` (clientes de outras plataformas) · `src/app` (camada visual, só apresenta). Toda informação exportada carrega `origem` (vobi/people/a360), `natureza` (original/calculado/inferencia_ia — este último reservado, sem uso) e `dataReferencia` (data da exportação do Vobi). Identificadores: projeto = Código do Vobi; pessoa = e-mail @rucelle; carga = id sequencial.

Para ligar a exportação ao Rucelle 360°: definir `EXPORT_TOKEN` no serviço `web` (valor gerado, nunca versionado) e o mesmo valor no consumidor; confirmar o formato com os padrões atuais do Rucelle 360° antes.

## T-199 · Painel de Gestão (08/11/2026)
- Nova rota `/painel` (perfis admin, gestão → visão executiva; coordenação → visão operacional; arquiteta → `/sem-permissao`). Autorização em `exigirUsuario(["admin","gestao","coordenacao"])`.
- `/panorama` redireciona para `/painel` (D-B); página inicial `/` por perfil: arquiteta → `/meu-dia`, demais → `/painel` (D-D).
- D-A: arquiteta vê em `/projetos` e `/projetos/[codigo]` só projetos em que participa segundo o Vobi — nome em "Colaboradores" do projeto OU responsável por tarefa na última carga (`src/lib/participacao.ts`); sem associação e-mail↔nome Vobi, não vê projeto nenhum até o mapeamento em Pessoas.
- D-C: refação só como contagem de tarefas de revisão; percentual de horas não exibido no painel.
- Nenhuma migração; nenhum dado alterado; Meu Dia inalterado (só o menu ganhou "Painel de Gestão").

## T-187 · Agenda — Etapa 1 (09/11/2026)
- Migração `0003_agenda.sql` (tabelas `conexao_agenda`, `evento_agenda`); reversão em `drizzle/reversao/0003_agenda.down.sql`.
- Variáveis no Railway: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `AGENDA_TOKEN_KEY` (32 bytes base64, cifra AES-256-GCM dos tokens). Sem elas a tela mostra "integração não configurada". `APP_URL` é opcional (padrão: `RAILWAY_PUBLIC_DOMAIN`).
- Redirect URI registrado no Google: `https://architecture-360-production.up.railway.app/api/agenda/callback`. Escopo `calendar.readonly` + `openid email`. Consentimento interno (`hd=rucelle.com.br`).
- OAuth por usuário (D1): `/api/agenda/conectar` → Google → `/api/agenda/callback`. Sincronização sob demanda ao abrir `/agenda`, cache 10 min (D5), botão "Atualizar agora"; janela −7/+60 dias. Eventos privados guardados só como "ocupado". Token expirado renova; refresh recusado → estado "revogada" (tokens apagados); falha HTTP → estado "erro", eventos anteriores mantidos. Desconectar revoga no Google e apaga tudo do usuário. Logs sem tokens, códigos ou dados de evento.

## T-187 · Agenda — Etapa 2 (09/11/2026, decisão D6)
- Migração `0004_agenda_etapa2.sql` (colunas novas em `conexao_agenda`/`evento_agenda`, tabela `agenda_acao`); reversão em `drizzle/reversao/`.
- Escopo OAuth: `calendar.readonly` + `calendar.events`. Conexões antigas (só leitura) continuam funcionando; a tela pede "Reautorizar com edição" para criar/editar/excluir. Mesmas variáveis do Railway.
- `/agenda` (mês/semana/dia, `?v=&d=`), `/agenda/conexao`, `/agenda/novo`, `/agenda/e/[id]` (+ `/editar`, `/excluir`). Escritas vão ao Google primeiro (If-Match quando há ETag) e o espelho é atualizado com a resposta; auditoria em `agenda_acao` sem conteúdo.
- Só o organizador edita/exclui; eventos privados só como "ocupado"; associação a projeto no A360 + propriedade privada `a360_projeto` no evento do Google. Vobi segue só leitura.

## T-188 · Reuniões (09/11/2026)
- Migração `0005_reunioes.sql` (`reuniao`, `reuniao_item`, `reuniao_historico` só-acréscimo); reversão em `drizzle/reversao/`.
- Rotas `/reunioes`, `/reunioes/nova` (`?projeto=` ou `?evento=` da Agenda), `/reunioes/[id]` (ata, decisões, aprovações, encaminhamentos, histórico), `/reunioes/[id]/editar`. Botão "Registrar reunião"/"Abrir reunião" no detalhe do compromisso da Agenda; seção "Reuniões" no detalhe do projeto.
- Opcional ao criar: compromisso na Google Agenda do usuário (reutiliza a Agenda; só com permissão de edição). Vobi segue só leitura; encaminhamentos não viram tarefas do Vobi nem geram cobrança/notificação.
- Visibilidade: coordenação/gestão/admin veem tudo; arquiteta vê o que criou, de que participa ou de projetos em que participa (regra D-A).

## T-188 · evolução — transcrições, atas por IA, linha do tempo, flags, divergências e alertas (09/11/2026)
- Migração `0006_inteligencia.sql` (`reuniao_transcricao` com o arquivo em bytea, `reuniao_processamento`, `projeto_alerta` + histórico, `flag_limitacao`, `projeto_analise`; colunas de origem/confiança/trecho em `reuniao_item` e ata estruturada em `reuniao`); reversão em `drizzle/reversao/`.
- Variáveis opcionais: `ANTHROPIC_API_KEY` (atas por IA e análise de divergências; sem ela, extração por regras marcada "confirmar" e flag aberta), `ANTHROPIC_MODEL` (padrão `claude-sonnet-5-5`).
- Formatos de transcrição: .txt, .md, .docx, .pdf, .vtt, .srt (até 15 MB); download do original em `/api/reunioes/transcricao?id=` (só quem vê a reunião).
- Rotas novas: `/projetos/[codigo]/linha-do-tempo`, `/alertas`, `/alertas/[id]`, `/integracao-vobi`. Painel ganhou o bloco "Divergências e limitações de dados". Vobi continua só leitura; a IA identifica, a gestão decide.
- Controle de consumo da IA (09/11, 17:44): tabela `ia_uso` (migração 0007) com tokens, custo estimado (preços públicos de 09/11/2026), HTTP e latência; limite de 300 mil caracteres por transcrição; teto diário estimado `IA_LIMITE_DIARIO_USD` (padrão 10); reprocessamento da mesma transcrição pelo mesmo modelo só se forçado; `/v1/models` confirma o modelo. Validação real executável por admin em `/integracao-vobi` (reunião fictícia "[TESTE A360 - VALIDAÇÃO IA]"); a flag "IA não configurada" só encerra após chamada real bem-sucedida.

## T-205 · Gestão de usuários e acesso da equipe (10/11/2026)
- Migração `0008_usuarios.sql` (colunas `trocar_senha`, `ultimo_acesso_em`, `atualizado_em` em `usuario`); reversão em `drizzle/reversao/`.
- `/usuarios` (só `admin`): criar acesso (nome, e-mail `@rucelle.com.br` — domínio em `DOMINIO_EMAIL`, perfil), alterar perfil, desativar (encerra sessões) / reativar, redefinir senha. Senha provisória de 14 caracteres gerada no servidor, exibida uma única vez na resposta da ação (nunca em URL, banco, log ou GitHub); só o hash bcrypt é gravado. Proteções: não desativar a si mesmo; não remover/desativar o último admin ativo.
- `/conta/senha` (todos): troca da própria senha (atual + nova 2×, mínimo 10); encerra as demais sessões. Usuário com `trocar_senha` é redirecionado para lá pelo layout autenticado antes de qualquer tela.
- Último acesso registrado em `usuario.ultimo_acesso_em` a cada login.

## T-189 · Fase 5 — Capacidade e fluxo (10/11/2026)
- Rota `/capacidade` (coordenação, gestão, admin). Serviço em `src/lib/servicos/capacidade.ts`: carga planejada por pessoa × 6 semanas, fluxo por etapa, projetos sem responsável, entregas próximas, limitações. Só dados importados do Vobi + reuniões do A360; sem ranking. Sem migração.

## T-190 · Fase 6 — Aprovações internas de entregáveis (10/11/2026)
- Migração `0009_entregaveis.sql` (`entregavel`, `entregavel_versao` com arquivo opcional em bytea, `entregavel_aprovacao` com evidência, `entregavel_comentario`, `entregavel_historico` só-acréscimo); reversão em `drizzle/reversao/`.
- Rotas `/entregaveis`, `/entregaveis/novo` (`?projeto=`), `/entregaveis/[id]` (versões, aprovações, situação, comentários, histórico), `/entregaveis/[id]/editar`; download em `/api/entregaveis/arquivo?v=|a=` só para quem vê o entregável. Seção "Entregáveis" no detalhe do projeto; eventos na linha do tempo.
- Regras: projeto/cliente do Vobi (só leitura); arquiteta vê/registra nos projetos em que participa (regra D-A); aprovação interna só coordenação/gestão/admin; aprovação do cliente exige evidência (tipo, data, quem + trecho/arquivo/item de reunião) — nunca presumida; versão nova após aprovação volta para revisão interna; cancelamento só gestão com justificativa; nada é enviado ao cliente pelo A360.

## Decisão de governança — etapas do Vobi (10/11/2026)
- Cancelada a proposta de classificar as etapas não mapeadas por tabela de sinônimos. Os nomes originais das etapas do Vobi são preservados integralmente (`tarefa.etapa_csv`) e são o que as telas mostram: projeto, Tarefas (coluna e filtro), Meu Dia, Capacidade e fluxo, Painel (gargalos por etapa), recomendações.
- `etapa_canonica` continua existindo só como apoio interno de indicadores já aprovados (contagem de Refação e detecção de etapas de entrega); não renomeia, não substitui e não aparece como nome da etapa.
- Vínculo tarefa → projeto: pelo código do projeto no CSV; tarefa sem projeto resolvido fica `orfa=true`, fora dos indicadores e listada em Qualidade dos dados como pendência de associação (nunca atribuída por suposição).

## T-217 · Treinamento dentro do A360 (11/11/2026)
- `web/treinamento/`: três trilhas (arquiteta, coordenacao, gerencia) geradas por `gerar.py` + telas em `shots/` (fora de `public/`; contêm nomes de projetos reais). Rotas `/treinamento` (redireciona para a trilha do perfil), `/treinamento/[perfil]` e `/treinamento/shots/[nome]`, todas só para usuário logado; gestão e admin veem as três trilhas. Menu "Ajuda › Como usar o A360".
- Para atualizar o material: editar `gerar.py`, rodar `python3 treinamento/gerar.py treinamento api` (a partir de `web/`; `api` = texto da sincronização automática, em vigor desde 11/11/2026) e substituir as telas em `shots/`.

## T-218 · Sincronização com a API do Vobi (11/11/2026)
- **Somente leitura.** `src/lib/vobi/api.ts` só faz GET (mais o POST de obtenção do token). Nada é criado, alterado ou apagado no Vobi.
- **Variáveis** (serviço `architecture-360` › Variables), definidas por Rodrigo:
  - `VOBI_API_UUID`
  - `VOBI_API_SECRET`
  - Opcional: `VOBI_SYNC_AUTO=off` suspende a agenda diária; `VOBI_API_BASE` serve só para teste.
  - As credenciais e o token nunca vão para log, banco, GitHub ou mensagem de erro.
- **Agenda.** Roda dentro do próprio serviço web (`src/instrumentation.ts`, verificação a cada 10 min), sem serviço extra no Railway. Uma sincronização por dia a partir das 06:00 de Brasília. Em caso de falha, nova tentativa a cada hora, até 3 por dia. Sincronização interrompida por reinício não bloqueia o dia. Há também o botão "Sincronizar agora" em /importacao (admin e gestão).
- **Mesmas regras do CSV.** `src/lib/vobi/adaptador.ts` monta os arquivos no layout v1 e passa pelo `executarCarga` do importador (chaves, recorte 2026, não encontrados, renomeações, carga anômala retida, vínculo com clientes).
  - Etapas: nomes originais (refurbish-step.name).
  - Clientes: só os campos autorizados; o que a API não traz é mantido da base.
- **Aceite.**
  - A primeira sincronização pela API fica em prévia para conferência.
  - As seguintes entram sozinhas.
  - Uma carga retida pelos limiares não é gravada.
  - Se o Vobi não mudou (mesmo hash), a carga fica registrada como "ignorada" e conta como em dia.
- **Limitações da API:**
  - Responsável vem só como número. O mapa id → nome (tabela `vobi_responsavel`, migração 0011) é resolvido por correspondência com a última exportação CSV (pelo menos 2 tarefas e 80% de concordância). Os demais são indicados uma vez em Pessoas.
  - Colaboradores e etiquetas do projeto não vêm da API e são mantidos da última exportação.
  - A unidade de horas é conferida contra a base em cada leitura (padrão: horas).
- **CSV continua como contingência**, na mesma tela.
- **Teste local:** servidor simulado em `.local/mockvobi/` gerado a partir da base local. Resultados:
  - 1ª sincronização em prévia: 0 projetos alterados, 455 clientes sem alteração.
  - Re-sincronização sem mudança: ignorada.
  - Mudança de 3 tarefas + 1 nova: aplicada sozinha.
  - Responsável sem nome indicado em Pessoas: as tarefas passam a mostrar o nome e o e-mail.
  - O HTTP 429 do simulador foi tratado com nova tentativa.

## T-219 · Agenda gerencial + base da integração bidirecional com o Vobi — Fase 0 (12/11/2026)
- **Migração 0012** (reversão em `drizzle/reversao/0012_agenda_gerencial.down.sql`): `atividade`, `atividade_historico`, `vobi_envio` (fila), `vobi_etapa` e `vobi_tarefa` (espelho com os números do Vobi).
- **Agenda única** (/agenda): compromissos do Google + atividades do A360 + prazos das tarefas do Vobi (camada opcional).
  - Gestão (admin, gestão e coordenação) vê a equipe toda ou uma pessoa, filtra por projeto, programa e altera.
  - Arquiteta vê só a própria agenda; o servidor ignora `?pessoa=`, devolve 404 para a atividade de outra pessoa e sem-permissão para criar.
- **Atividade:** pode ser independente (tipo), uma tarefa existente do Vobi ou uma nova tarefa no projeto. O prazo é a Data de término, o mesmo endDate do Vobi. Nomes e códigos seguem o Vobi.
- **Fase 0, sem escrita no Vobi:** não há código de envio. Mudanças em atividades vinculadas ficam em `pendentes` e na fila `vobi_envio` como "aguardando".
- **Leitura diária (T-218):** atualiza o espelho e reconcilia (`src/lib/vobi/reconciliar.ts`, funções puras):
  - mudança só no Vobi é adotada;
  - campos diferentes mudados nos dois lados se combinam;
  - o mesmo campo mudado nos dois lados vai para Conflitos (/agenda/pendencias), e a gestão decide;
  - tarefa ausente é conferida pelo número (GET task/{id}); só um 404 marca divergência, e nada é apagado.
- **Testes:**
  - Locais (`.local/t219-unit.mts`): 15 casos das regras.
  - Ponta a ponta com o Vobi simulado (`.local/mockvobi`, `.local/t219.mts`): criar os três tipos de atividade, bloqueio de duplicidade, permissões da arquiteta, adoção, conflito, divergência e resolução de conflito.
