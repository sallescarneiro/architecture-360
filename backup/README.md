# Backup do PostgreSQL — Architecture 360

Rotina de backup completo, criptografado e guardado fora da Railway, no **Drive compartilhado** do Workspace "A360 Backups (restrito)" (id `0AFwJGn6UuWW0Uk9PVA`; participantes: Rodrigo e a conta de serviço). Contas de serviço não têm cota em "Meu Drive", por isso o destino precisa ser um Drive compartilhado. Roda como **serviço agendado (cron)** no mesmo projeto Railway, pela rede privada; o banco continua sem acesso público.

## Como funciona
1. `pg_dump --format=custom` do banco de produção (formato comprimido, restaurável com `pg_restore`).
2. Criptografia **antes de sair do processo**: AES-256-GCM com chave aleatória por arquivo + RSA-OAEP 4096 com a **chave pública** (variável `BACKUP_PUBLIC_KEY`). Só a **chave privada**, guardada pelo Rodrigo fora da Railway, decifra. Arquivo adulterado é rejeitado na decifragem.
3. Upload para o Drive compartilhado (`GDRIVE_FOLDER_ID` = id do drive ou de uma pasta nele) com a **conta de serviço** `a360-backup@architecture-360.iam.gserviceaccount.com` (projeto Google Cloud `architecture-360`; chave em `GDRIVE_SA_JSON`, papel "Administrador de conteúdo" no drive); o tamanho gravado no Drive é conferido com o enviado.
4. Retenção: diários por 30 dias; o backup do dia 1 de cada mês fica 12 meses (`RETENCAO_DIAS`, `RETENCAO_MENSAL_MESES`).
5. Log só com nome, tamanho e sha256. Qualquer falha → saída 1 (execução marcada como erro no Railway).

Nome dos arquivos: `a360-AAAA-MM-DD-HH-MM.dump.enc`.

## Variáveis do serviço `backup` (Railway)
| Variável | Valor | Segredo? |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | referência interna |
| `BACKUP_PUBLIC_KEY` | conteúdo de `a360-backup-publica.pem` | não (é pública) |
| `GDRIVE_SA_JSON` | JSON da chave da conta de serviço Google | **sim** — só no Railway |
| `GDRIVE_FOLDER_ID` | `0AFwJGn6UuWW0Uk9PVA` (Drive compartilhado A360 Backups) | não |
| `RETENCAO_DIAS` / `RETENCAO_MENSAL_MESES` | `30` / `12` (opcionais) | não |

Agendamento sugerido (Settings → Cron Schedule): `0 6 * * *` (03:00 em Brasília).

## Chaves
`node backup/gerar-chaves.mjs <pasta>` gera `a360-backup-publica.pem` e `a360-backup-PRIVADA.pem`. A privada fica com o Rodrigo (gerenciador de senhas + cópia offline). Sem ela, nenhum backup é recuperável; com ela vazada, os backups ficam legíveis — nunca no Railway, GitHub ou chat.

## Restauração (nunca sobre produção)
Em um computador com Node 22 e **PostgreSQL client 18** (mesma versão maior do servidor; `pg_restore` 16/17 recusa o arquivo):
```
node backup/decifrar.mjs a360-2026-11-06-06-00.dump.enc a360-backup-PRIVADA.pem a360.dump
createdb a360_restaurado            # ou um Postgres novo no Railway
pg_restore --no-owner --no-privileges -d postgres://.../a360_restaurado a360.dump
```
Depois apontar o serviço `web` para o banco restaurado (variável `DATABASE_URL`) só com decisão expressa da direção. Comprovado em 06/11/2026: pipeline completo (dump → cifra → decifra → pg_restore) em banco local PostgreSQL 16 com contagens idênticas; o primeiro backup real de produção (`a360-2026-11-06-11-48.dump.enc`, 226.419 bytes) foi baixado do Drive, decifrado com a chave privada (sha256 igual ao do log) e inspecionado (13 tabelas no sumário). A restauração do arquivo real exige `pg_restore` 18.

A imagem é publicada em `ghcr.io/sallescarneiro/a360-backup` (pública; contém só os scripts) pelo workflow `.github/workflows/backup-image.yml`; o serviço Railway `backup` usa essa imagem com cron `0 6 * * *`.

## Teste manual da rotina
No Railway, serviço `backup` → Deployments → "Run" (ou aguardar o cron). Conferir no log: `enviado ao Drive: a360-... (N bytes)` e o arquivo na pasta do Drive com o mesmo tamanho.
