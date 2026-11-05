# Architecture 360

Camada complementar de gestão e inteligência da equipe de arquitetura da Rucelle.
O Vobi continua sendo o sistema operacional oficial; este importador **só lê** as
exportações oficiais (menu Ações › Exportar CSV) e nunca escreve no Vobi.

Especificação: "Architecture 360 — Exploração do Vobi e Especificação do Importador — v2.0"
(documento interno, seções 1–3). Esta PoC cobre a seção 5 daquele documento.

## O que faz
- Recebe `Projetos.csv` e `Tarefas.csv`, valida o cabeçalho (layout v1), guarda as linhas brutas com hash da carga.
- Normaliza nomes, etapas (tabela de sinônimos), datas, horas e pessoas (nome → e-mail).
- Chaves: projeto por `Código`; tarefa por chave composta provisória
  (`código do projeto | etapa | nome | ocorrência`) até a Vobi expor o ID da tarefa.
- Compara com a última carga aceita: novo / alterado (histórico campo a campo) / não encontrado
  (nada é apagado) / possível renomeação (sugestão, um-para-um).
- Retém cargas anômalas (muitos "não encontrados" ou poucas linhas) e recusa layout desconhecido.
- Classifica a qualidade de cada tarefa (completa, sem responsável, sem prazo, sem início, órfã, encerrada)
  e gera a lista "Corrigir no Vobi".

## Uso
```
python3 importador/importador.py carregar  --db a360.sqlite --projetos Projetos.csv --tarefas Tarefas.csv --enviado-por "nome"
python3 importador/importador.py relatorio  --db a360.sqlite
python3 importador/importador.py pendencias --db a360.sqlite
```
Somente biblioteca padrão do Python 3.11+ (SQLite embutido). Sem servidor, sem deploy.

## Dados
Os CSVs contêm dados de clientes e **não são versionados** (`.gitignore`). Guarde-os no local autorizado
(Google Drive da Rucelle) e mantenha-os fora deste repositório.

## Estrutura
- `web/` — aplicação (Next.js + Postgres): importação com prévia e confirmação, qualidade dos dados, operação, pessoas. Ver `web/README.md`.
- `importador/` — PoC em Python (referência validada; a lógica foi portada para `web/src/lib/importador`).

## Resultado da PoC (05/11/2026)
Sete critérios da seção 5.2 verificados com os arquivos reais de 04/11/2026 — ver `POC_RESULTADO.md`.
