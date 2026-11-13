import { doublePrecision,
  pgTable, serial, integer, text, timestamp, boolean, jsonb, real, customType, index, uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// ---------------------------------------------------------------------------
// Autenticação e perfis (usuário/senha cadastrados; e-mail @rucelle não dá acesso)
// ---------------------------------------------------------------------------
export const usuarios = pgTable("usuario", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  email: text("email").notNull().unique(),
  senhaHash: text("senha_hash").notNull(),
  perfil: text("perfil").notNull().default("arquiteta"), // admin | gestao | coordenacao | arquiteta
  ativo: boolean("ativo").notNull().default(true),
  trocarSenha: boolean("trocar_senha").notNull().default(false), // T-205: senha provisória → troca obrigatória no próximo acesso
  ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const sessoes = pgTable("sessao", {
  id: text("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Cargas (cada execução da importação) — seção 1.1 da especificação v2.0
// ---------------------------------------------------------------------------
export const cargas = pgTable("carga", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(), // previa | aceita | retida | recusada | ignorada | descartada | erro
  origem: text("origem").notNull().default("csv"), // csv (exportação enviada) | api (sincronização automática, T-218)
  tipo: text("tipo").notNull().default("operacao"), // operacao (Projetos+Tarefas, Clientes opcional) | clientes (só Clientes)
  motivo: text("motivo"),
  dataCarga: text("data_carga").notNull(), // AAAA-MM-DD (data da exportação informada pelo usuário)
  enviadoPorId: integer("enviado_por_id").references(() => usuarios.id),
  confirmadoPorId: integer("confirmado_por_id").references(() => usuarios.id),
  arqProjetos: text("arq_projetos"),
  hashProjetos: text("hash_projetos"),
  linhasProjetos: integer("linhas_projetos"),
  arqTarefas: text("arq_tarefas"),
  hashTarefas: text("hash_tarefas"),
  linhasTarefas: integer("linhas_tarefas"),
  conteudoProjetos: bytea("conteudo_projetos"), // guardado só enquanto a carga está em prévia
  conteudoTarefas: bytea("conteudo_tarefas"),
  arqClientes: text("arq_clientes"),
  hashClientes: text("hash_clientes"), // hash do arquivo original exportado do Vobi
  linhasClientes: integer("linhas_clientes"),
  conteudoClientes: bytea("conteudo_clientes"), // só colunas autorizadas (CPF/CNPJ, RG/IE, nascimento, endereço e observações nunca entram)
  relatorio: jsonb("relatorio"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
});

export const brutoProjetos = pgTable("bruto_projeto", {
  id: serial("id").primaryKey(),
  cargaId: integer("carga_id").notNull().references(() => cargas.id),
  linha: integer("linha").notNull(),
  dados: jsonb("dados").notNull(),
}, (t) => [index("bruto_projeto_carga_idx").on(t.cargaId)]);

export const brutoTarefas = pgTable("bruto_tarefa", {
  id: serial("id").primaryKey(),
  cargaId: integer("carga_id").notNull().references(() => cargas.id),
  linha: integer("linha").notNull(),
  dados: jsonb("dados").notNull(),
}, (t) => [index("bruto_tarefa_carga_idx").on(t.cargaId)]);

// ---------------------------------------------------------------------------
// Pessoas do Vobi → e-mail da Rucelle (seção 1.5)
// ---------------------------------------------------------------------------
export const pessoasVobi = pgTable("pessoa_vobi", {
  nomeVobi: text("nome_vobi").primaryKey(),
  chaveNome: text("chave_nome").notNull(),
  emailRucelle: text("email_rucelle"),
  origem: text("origem").notNull(), // semente | manual | nao_mapeada
}, (t) => [uniqueIndex("pessoa_vobi_chave_idx").on(t.chaveNome)]);

// T-218: a API do Vobi identifica o responsável só por um número. id → nome da pessoa no Vobi, resolvido por
// correspondência com a última exportação CSV (auto_csv) ou definido pela coordenação/gestão na tela Pessoas (manual).
export const vobiResponsaveis = pgTable("vobi_responsavel", {
  idVobi: integer("id_vobi").primaryKey(),
  nome: text("nome").notNull(),
  origem: text("origem").notNull(), // auto_csv | manual
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Modelo consolidado (camada 2: dados compilados do Vobi)
// ---------------------------------------------------------------------------
export const projetos = pgTable("projeto", {
  codigo: integer("codigo").primaryKey(), // ID estável do Vobi
  nome: text("nome").notNull(),
  chaveNome: text("chave_nome").notNull(),
  cliente: text("cliente"),
  status: text("status"),
  statusClasse: text("status_classe"), // ativo | pausado | encerrado
  criadoEm: text("criado_em"),
  // T-219 (decisão de 12/11/2026): data de início prevista do projeto no Vobi (startDate, AAAA-MM-DD) — define o recorte 2026.
  // Gravada a cada leitura da API, fora do importador (não entra na comparação da carga).
  inicioPrevisto: text("inicio_previsto"),
  metragem: real("metragem"),
  etiquetas: jsonb("etiquetas").$type<string[]>().notNull().default([]),
  colaboradores: jsonb("colaboradores").$type<string[]>().notNull().default([]),
  primeiraCarga: integer("primeira_carga").notNull(),
  ultimaCarga: integer("ultima_carga").notNull(),
  naoEncontradoDesde: integer("nao_encontrado_desde"),
  // Etapa 2 — vínculo com cliente_vobi (derivado do campo "cliente (nome)"; o Vobi não exporta o código do cliente no projeto)
  clienteCodigo: integer("cliente_codigo"),
  vinculoClienteStatus: text("vinculo_cliente_status").notNull().default("sem_cliente"), // resolvido | ambiguo | sem_cliente | manual
}, (t) => [index("projeto_chave_nome_idx").on(t.chaveNome), index("projeto_cliente_idx").on(t.clienteCodigo)]);

// ---------------------------------------------------------------------------
// Clientes do Vobi (Etapa 1) — espelho somente leitura. Chave = Código do Vobi.
// Campos autorizados apenas; nunca se apaga cliente ausente numa exportação (fica "não encontrado").
// ---------------------------------------------------------------------------
export const clientesVobi = pgTable("cliente_vobi", {
  codigo: integer("codigo").primaryKey(),
  nome: text("nome").notNull(),
  chaveNome: text("chave_nome").notNull(),
  razaoSocial: text("razao_social"),
  tipo: text("tipo"),           // pf | pj
  status: text("status"),       // Ativo | Inativo
  email: text("email"),
  telefone: text("telefone"),
  cidade: text("cidade"),
  estado: text("estado"),
  criadoEmVobi: text("criado_em_vobi"), // AAAA-MM-DD
  origem: text("origem").notNull().default("vobi"),
  primeiraCarga: integer("primeira_carga").notNull(),
  ultimaCarga: integer("ultima_carga").notNull(),
  naoEncontradoDesde: integer("nao_encontrado_desde"),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("cliente_vobi_chave_nome_idx").on(t.chaveNome)]);

// Decisão manual da coordenação para um projeto cujo nome de cliente é ambíguo (ou sem correspondência).
// Vale enquanto o nome do cliente no projeto continuar o mesmo (chave_nome_csv); se o Vobi mudar o nome, a decisão deixa de ser aplicada.
export const vinculosClienteManual = pgTable("vinculo_cliente_manual", {
  projetoCodigo: integer("projeto_codigo").primaryKey(),
  clienteCodigo: integer("cliente_codigo").notNull(),
  chaveNomeCsv: text("chave_nome_csv").notNull(),
  decididoPorId: integer("decidido_por_id").references(() => usuarios.id),
  decididoEm: timestamp("decidido_em", { withTimezone: true }).notNull().defaultNow(),
  observacao: text("observacao"),
});

export const tarefas = pgTable("tarefa", {
  chave: text("chave").primaryKey(), // codigo|etapa|nome|ocorrencia (provisória até a Vobi expor o ID)
  idVobi: integer("id_vobi"), // T-219: número da tarefa no Vobi, só quando a correspondência é única (nunca por aproximação)
  projetoCodigo: integer("projeto_codigo"), // null = órfã
  projetoNomeCsv: text("projeto_nome_csv"),
  etapaCsv: text("etapa_csv"),
  etapaCanonica: text("etapa_canonica"),
  etapaConhecida: boolean("etapa_conhecida").notNull().default(true),
  nome: text("nome").notNull(),
  nomeChave: text("nome_chave").notNull(),
  ocorrencia: integer("ocorrencia").notNull().default(1),
  revisao: integer("revisao"),
  status: text("status"),
  prioridade: text("prioridade"),
  dataInicio: text("data_inicio"),
  dataFim: text("data_fim"),
  horasEstimadasMin: integer("horas_estimadas_min"),
  horasRealizadasMin: integer("horas_realizadas_min"),
  responsavelNome: text("responsavel_nome"),
  responsavelEmail: text("responsavel_email"),
  semResponsavel: boolean("sem_responsavel").notNull().default(false),
  semInicio: boolean("sem_inicio").notNull().default(false),
  semFim: boolean("sem_fim").notNull().default(false),
  orfa: boolean("orfa").notNull().default(false),
  colisao: boolean("colisao").notNull().default(false),
  classeQualidade: text("classe_qualidade").notNull(),
  primeiraCarga: integer("primeira_carga").notNull(),
  ultimaCarga: integer("ultima_carga").notNull(),
  naoEncontradoDesde: integer("nao_encontrado_desde"),
  motivoNaoEncontrado: text("motivo_nao_encontrado"),
}, (t) => [index("tarefa_projeto_idx").on(t.projetoCodigo), index("tarefa_ultima_carga_idx").on(t.ultimaCarga)]);

// Recorte 2026: projetos encerrados antes de 2026 (e suas tarefas) saem das tabelas ativas e ficam guardados aqui,
// com o registro completo. Nada é apagado; se o projeto for reaberto no Vobi, a próxima carga o traz de volta.
export const projetosArquivados = pgTable("projeto_arquivado", {
  codigo: integer("codigo").primaryKey(),
  dados: jsonb("dados").$type<Record<string, unknown>>().notNull(),
  arquivadoNaCarga: integer("arquivado_na_carga").notNull(),
  arquivadoEm: timestamp("arquivado_em", { withTimezone: true }).notNull().defaultNow(),
});
export const tarefasArquivadas = pgTable("tarefa_arquivada", {
  chave: text("chave").primaryKey(),
  projetoCodigo: integer("projeto_codigo"),
  dados: jsonb("dados").$type<Record<string, unknown>>().notNull(),
  arquivadoNaCarga: integer("arquivado_na_carga").notNull(),
  arquivadoEm: timestamp("arquivado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tarefa_arquivada_projeto_idx").on(t.projetoCodigo)]);

export const historicoAlteracoes = pgTable("historico_alteracoes", {
  id: serial("id").primaryKey(),
  cargaId: integer("carga_id").notNull(),
  entidade: text("entidade").notNull(),
  chave: text("chave").notNull(),
  campo: text("campo").notNull(),
  valorAnterior: text("valor_anterior"),
  valorNovo: text("valor_novo"),
}, (t) => [index("hist_carga_idx").on(t.cargaId)]);

export const alertas = pgTable("alerta", {
  id: serial("id").primaryKey(),
  cargaId: integer("carga_id").notNull(),
  tipo: text("tipo").notNull(),
  entidade: text("entidade").notNull(),
  chave: text("chave"),
  detalhe: text("detalhe"),
}, (t) => [index("alerta_carga_idx").on(t.cargaId)]);

// ---------------------------------------------------------------------------
// Espelho somente leitura do People Rucelle (fonte oficial da estrutura organizacional).
// Não é cadastro: nenhuma tela edita estas linhas; o A360 só as recebe do People e guarda origem + data.
// ---------------------------------------------------------------------------
export const pessoasPeople = pgTable("pessoa_people", {
  email: text("email").primaryKey(),             // identificador comum entre People, A360 e Vobi (via pessoa_vobi.email_rucelle)
  idPeople: text("id_people"),                   // identificador da pessoa no People, se fornecido
  nome: text("nome").notNull(),
  cargo: text("cargo"),
  funcao: text("funcao"),
  equipe: text("equipe"),
  gestorEmail: text("gestor_email"),
  coordenadorEmail: text("coordenador_email"),
  ativo: boolean("ativo"),
  atualizadoEmPeople: timestamp("atualizado_em_people", { withTimezone: true }),
  sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }).notNull().defaultNow(),
  origem: text("origem").notNull().default("people"),
});

export const sincronizacoesPeople = pgTable("sincronizacao_people", {
  id: serial("id").primaryKey(),
  em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull(),              // ok | indisponivel | erro | nao_configurado
  pessoas: integer("pessoas"),
  motivo: text("motivo"),
  porId: integer("por_id").references(() => usuarios.id),
});

// ---------------------------------------------------------------------------
// Agenda (T-187, Fase 3) — Google Calendar somente leitura, OAuth por usuário (D1).
// Tokens cifrados (AES-256-GCM, chave só em variável de ambiente), um registro por usuário, escopo calendar.readonly.
// Eventos privados do Google são guardados só como "ocupado" (sem título, participantes, local ou links) — D2 e acréscimo 6.
// ---------------------------------------------------------------------------
export const conexoesAgenda = pgTable("conexao_agenda", {
  usuarioId: integer("usuario_id").primaryKey().references(() => usuarios.id),
  emailGoogle: text("email_google"),
  refreshTokenCifrado: text("refresh_token_cifrado"),
  accessTokenCifrado: text("access_token_cifrado"),
  accessExpiraEm: timestamp("access_expira_em", { withTimezone: true }),
  estado: text("estado").notNull().default("conectada"), // conectada | revogada | erro
  erro: text("erro"),                                      // mensagem curta e sem dados sensíveis
  conectadoEm: timestamp("conectado_em", { withTimezone: true }).notNull().defaultNow(),
  ultimaSincEm: timestamp("ultima_sinc_em", { withTimezone: true }),      // última tentativa
  ultimaSincOkEm: timestamp("ultima_sinc_ok_em", { withTimezone: true }), // última sincronização bem-sucedida
  eventos: integer("eventos").notNull().default(0),
  escopos: text("escopos"),                                // escopos concedidos (separados por espaço); escrita exige calendar.events
  calendarios: jsonb("calendarios").$type<CalendarioGoogle[]>().notNull().default([]), // calendários do usuário (lista, acesso)
});

export type CalendarioGoogle = { id: string; nome: string; primario: boolean; acesso: "owner" | "writer" | "reader" | "freeBusyReader"; cor: string | null };

export const eventosAgenda = pgTable("evento_agenda", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  googleId: text("google_id").notNull(),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fim: timestamp("fim", { withTimezone: true }).notNull(),
  diaInteiro: boolean("dia_inteiro").notNull().default(false),
  privado: boolean("privado").notNull().default(false),
  titulo: text("titulo"),
  local: text("local"),
  participantes: jsonb("participantes").$type<{ email: string; nome: string | null; externo: boolean; resposta?: string | null }[]>().notNull().default([]),
  externos: integer("externos").notNull().default(0),
  meetLink: text("meet_link"),
  htmlLink: text("html_link"),
  status: text("status"),                                  // confirmed | tentative
  atualizadoGoogleEm: timestamp("atualizado_google_em", { withTimezone: true }),
  sincronizadoEm: timestamp("sincronizado_em", { withTimezone: true }).notNull().defaultNow(),
  // Etapa 2
  calendarioId: text("calendario_id").notNull().default("primary"),
  descricao: text("descricao"),
  organizadorEmail: text("organizador_email"),
  souOrganizador: boolean("sou_organizador").notNull().default(false),
  etag: text("etag"),
  recorrenteDe: text("recorrente_de"),                     // id da série, quando é uma ocorrência
  tipo: text("tipo").notNull().default("outro"),           // cliente | interna | visita | outro | ocupado
  projetoCodigo: integer("projeto_codigo"),                // associação a projeto do Vobi (nunca escreve no Vobi)
  projetoOrigem: text("projeto_origem"),                   // manual | sugestao | google (propriedade privada a360_projeto)
}, (t) => [uniqueIndex("evento_agenda_usuario_google_uq").on(t.usuarioId, t.googleId), index("evento_agenda_usuario_inicio_idx").on(t.usuarioId, t.inicio)]);

/** Auditoria interna das escritas no Google (D6): quem, quando, o quê — sem título, participantes ou descrição. */
export const acoesAgenda = pgTable("agenda_acao", {
  id: serial("id").primaryKey(),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  acao: text("acao").notNull(),                            // criar | editar | excluir | associar
  calendarioId: text("calendario_id"),
  googleId: text("google_id"),
  resultado: text("resultado").notNull(),                  // ok | erro:<código>
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Reuniões (T-188, Fase 4) — reunião ligada a projeto/cliente do Vobi (só leitura) e, opcionalmente, a um evento da Agenda.
// Pauta, ata, decisões, aprovações e encaminhamentos ficam no A360; nada vira tarefa no Vobi. Histórico é só-acréscimo.
// ---------------------------------------------------------------------------
export const reunioes = pgTable("reuniao", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  projetoCodigo: integer("projeto_codigo"),                 // projeto do Vobi (fato importado)
  clienteCodigo: integer("cliente_codigo"),                 // cliente do Vobi, normalmente derivado do projeto
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fim: timestamp("fim", { withTimezone: true }).notNull(),
  local: text("local"),
  participantes: jsonb("participantes").$type<{ email: string | null; nome: string; externo: boolean }[]>().notNull().default([]),
  pauta: text("pauta"),
  ata: text("ata"),
  ataOrigem: text("ata_origem"),                            // manual | ia | regras
  ataEstruturada: jsonb("ata_estruturada"),                 // resultado estruturado do processamento (ver tipos)
  status: text("status").notNull().default("planejada"),    // planejada | realizada | cancelada
  eventoGoogleId: text("evento_google_id"),                 // id do evento no Google Calendar (quando ligada à Agenda)
  eventoUsuarioId: integer("evento_usuario_id"),            // dono da conexão em que o evento vive
  // T-227 (Inteligência de Reuniões, Etapa 1): motivo (assunto) e origem (quem solicitou), independentes; antigas ficam nulas
  motivoId: integer("motivo_id"),
  origem: text("origem"),                                    // cliente | rucelle | coordenacao | gestao | equipe_tecnica
  // gravação: só o link e metadados (o vídeo fica na plataforma externa)
  gravacaoUrl: text("gravacao_url"),
  gravacaoPlataforma: text("gravacao_plataforma"),
  gravacaoData: text("gravacao_data"),                       // AAAA-MM-DD
  gravacaoDuracaoMin: integer("gravacao_duracao_min"),
  // aviso obrigatório de que os participantes foram informados da gravação
  avisoGravacaoForma: text("aviso_gravacao_forma"),
  avisoGravacaoPor: integer("aviso_gravacao_por"),
  avisoGravacaoEm: timestamp("aviso_gravacao_em", { withTimezone: true }),
  // ciência sobre a transcrição, separada da gravação (reunião pode ter só transcrição, sem gravação)
  avisoTranscricaoForma: text("aviso_transcricao_forma"),
  avisoTranscricaoPor: integer("aviso_transcricao_por"),
  avisoTranscricaoEm: timestamp("aviso_transcricao_em", { withTimezone: true }),
  criadoPor: integer("criado_por").notNull().references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reuniao_projeto_idx").on(t.projetoCodigo), index("reuniao_inicio_idx").on(t.inicio), index("reuniao_evento_idx").on(t.eventoGoogleId)]);

export const itensReuniao = pgTable("reuniao_item", {
  id: serial("id").primaryKey(),
  reuniaoId: integer("reuniao_id").notNull().references(() => reunioes.id),
  tipo: text("tipo").notNull(),                             // decisao | aprovacao | encaminhamento
  texto: text("texto").notNull(),
  responsavel: text("responsavel"),                         // nome ou e-mail (encaminhamento)
  prazo: text("prazo"),                                     // AAAA-MM-DD (encaminhamento)
  situacao: text("situacao").notNull().default("aberto"),   // aberto | feito | cancelado (encaminhamento) · registrado (demais)
  criadoPor: integer("criado_por").notNull().references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  // evolução T-188: itens extraídos da transcrição
  origem: text("origem").notNull().default("manual"),       // manual | ia | regras
  confianca: text("confianca"),                             // mencionado | sintese | inferencia | confirmar | nao_identificado
  trecho: text("trecho"),                                   // trecho original da transcrição
  tempo: text("tempo"),                                     // marcação de tempo na transcrição (quando houver)
  processamentoId: integer("processamento_id"),
  confirmado: boolean("confirmado").notNull().default(true), // itens de IA começam não confirmados; a pessoa confirma ou descarta
}, (t) => [index("reuniao_item_reuniao_idx").on(t.reuniaoId)]);

/** Histórico imutável da reunião: cada alteração é uma linha nova; nunca se edita nem apaga. */
export const historicoReuniao = pgTable("reuniao_historico", {
  id: serial("id").primaryKey(),
  reuniaoId: integer("reuniao_id").notNull().references(() => reunioes.id),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  acao: text("acao").notNull(),                             // criada | editada | ata | status | item_novo | item_situacao | agenda
  resumo: text("resumo").notNull(),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("reuniao_historico_reuniao_idx").on(t.reuniaoId)]);

// ---------------------------------------------------------------------------
// T-188 (evolução, 09/11/2026): transcrições do Google Meet, atas por IA, alertas de divergência, flags de limitação e análises.
// Documentos ficam no banco (bytea), protegidos pelas permissões da reunião. IA identifica e recomenda; a gestão decide.
// ---------------------------------------------------------------------------
export const transcricoes = pgTable("reuniao_transcricao", {
  id: serial("id").primaryKey(),
  reuniaoId: integer("reuniao_id").notNull().references(() => reunioes.id),
  versao: integer("versao").notNull().default(1),
  atual: boolean("atual").notNull().default(true),
  nomeArquivo: text("nome_arquivo").notNull(),
  tipoMime: text("tipo_mime").notNull(),
  tamanho: integer("tamanho").notNull(),
  // T-227: novas transcrições guardam só o texto (conteudo nulo); as antigas mantêm o arquivo original
  conteudo: customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" })("conteudo"),
  hash: text("hash"),                                       // sha-256 do arquivo enviado (ou do texto colado)
  linkOriginal: text("link_original"),                      // link do arquivo original no Drive
  entrada: text("entrada"),                                 // arquivo | colado (null = antiga, arquivo)
  texto: text("texto"),                                     // texto extraído (preservado tal qual, sem edição)
  formato: text("formato"),                                 // txt | docx | pdf | vtt | srt | md | desconhecido
  enviadoPor: integer("enviado_por").notNull().references(() => usuarios.id),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("transcricao_reuniao_idx").on(t.reuniaoId)]);

export const processamentos = pgTable("reuniao_processamento", {
  id: serial("id").primaryKey(),
  reuniaoId: integer("reuniao_id").notNull().references(() => reunioes.id),
  transcricaoId: integer("transcricao_id").notNull().references(() => transcricoes.id),
  estado: text("estado").notNull().default("pendente"),     // pendente | processando | concluido | erro | regras
  provedor: text("provedor"),                               // anthropic | regras
  modelo: text("modelo"),
  resultado: jsonb("resultado"),                            // ata estruturada (ver src/lib/transcricao/tipos.ts)
  erro: text("erro"),
  itensCriados: integer("itens_criados").notNull().default(0),
  iniciadoPor: integer("iniciado_por").notNull().references(() => usuarios.id),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
}, (t) => [index("processamento_reuniao_idx").on(t.reuniaoId)]);

/** Alertas de divergência por projeto (gerados pela IA ou registrados pela gestão). Tratamento humano com histórico imutável. */
export const alertasProjeto = pgTable("projeto_alerta", {
  id: serial("id").primaryKey(),
  projetoCodigo: integer("projeto_codigo").notNull(),
  chave: text("chave").notNull(),                           // dedupe (hash da ocorrência)
  categoria: text("categoria").notNull(),                   // material | especificacao | layout | ambientes | equipamentos | dimensoes | quantitativos | solucao_tecnica | escopo | condicao_aprovacao | solicitacao_cliente | decisao_posterior | prazo | outro
  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull(),
  classificacao: text("classificacao").notNull(),           // divergencia_confirmada | possivel_divergencia | alteracao_aprovada | inconclusivo | corrigida | limitacao_dados
  prioridade: text("prioridade").notNull(),                 // critico | alto | moderado | informativo
  confianca: integer("confianca"),                          // 0–100 (da IA)
  evidencias: jsonb("evidencias").$type<{ origem: "a360" | "vobi"; tipo: string; ref: string; rotulo: string; trecho?: string; data?: string; link?: string }[]>().notNull().default([]),
  impacto: text("impacto"),
  situacao: text("situacao").notNull().default("aberto"),   // aberto | em_analise | esclarecimento | em_tratamento | resolvido | descartado
  responsavel: text("responsavel"),
  prazo: text("prazo"),
  direcionamento: text("direcionamento"),
  origem: text("origem").notNull().default("ia"),           // ia | humano
  analiseId: integer("analise_id"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  encerradoEm: timestamp("encerrado_em", { withTimezone: true }),
}, (t) => [uniqueIndex("projeto_alerta_chave_uq").on(t.projetoCodigo, t.chave), index("projeto_alerta_situacao_idx").on(t.situacao)]);

export const historicoAlerta = pgTable("projeto_alerta_historico", {
  id: serial("id").primaryKey(),
  alertaId: integer("alerta_id").notNull().references(() => alertasProjeto.id),
  usuarioId: integer("usuario_id").references(() => usuarios.id), // null = IA
  acao: text("acao").notNull(),                             // criado | confirmado | descartado | esclarecimento | alteracao_aprovada | correcao_rota | responsavel | prazo | providencia | encerrado | reaberto | reclassificado
  justificativa: text("justificativa"),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("alerta_hist_idx").on(t.alertaId)]);

/** Flags de limitação de dados: o que o A360 não consegue comparar e por quê. Encerram só com resolução ou aceite consciente. */
export const flagsLimitacao = pgTable("flag_limitacao", {
  id: serial("id").primaryKey(),
  projetoCodigo: integer("projeto_codigo"),                 // null = limitação geral da integração
  chave: text("chave").notNull(),
  comparacao: text("comparacao").notNull(),                 // qual comparação não pôde ser feita
  dadoAusente: text("dado_ausente").notNull(),
  informacaoDisponivel: text("informacao_disponivel"),
  informacaoNecessaria: text("informacao_necessaria").notNull(),
  origemEsperada: text("origem_esperada").notNull(),        // vobi | a360 | google
  tipo: text("tipo").notNull(),                             // disponibilidade | integracao | permissao | formato | ausencia_registro | falha_tecnica
  analisesComprometidas: text("analises_comprometidas"),
  alternativa: text("alternativa"),
  situacao: text("situacao").notNull().default("aberta"),   // aberta | aceita | resolvida
  decididoPor: integer("decidido_por").references(() => usuarios.id),
  decididoEm: timestamp("decidido_em", { withTimezone: true }),
  justificativa: text("justificativa"),
  identificadoEm: timestamp("identificado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("flag_limitacao_chave_uq").on(t.chave)]);

/** Análises de projeto (cruzamento A360 × Vobi pela IA): registro de cada execução, com entradas e resultado. */
export const analisesProjeto = pgTable("projeto_analise", {
  id: serial("id").primaryKey(),
  projetoCodigo: integer("projeto_codigo").notNull(),
  estado: text("estado").notNull().default("pendente"),     // pendente | processando | concluida | erro | sem_ia
  provedor: text("provedor"),
  modelo: text("modelo"),
  entradas: jsonb("entradas"),                              // resumo do que foi enviado (contagens e referências, não o conteúdo)
  resultado: jsonb("resultado"),
  alertasNovos: integer("alertas_novos").notNull().default(0),
  erro: text("erro"),
  iniciadoPor: integer("iniciado_por").references(() => usuarios.id),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  concluidoEm: timestamp("concluido_em", { withTimezone: true }),
}, (t) => [index("projeto_analise_projeto_idx").on(t.projetoCodigo)]);

/** Registro de uso da IA (T-188): cada chamada, com tokens e custo estimado. Nunca guarda a chave nem o conteúdo enviado. */
export const usoIa = pgTable("ia_uso", {
  id: serial("id").primaryKey(),
  tipo: text("tipo").notNull(),                             // ata | analise | teste_conexao
  referencia: text("referencia"),                           // ex.: processamento:12 | analise:3
  modelo: text("modelo"),
  tokensEntrada: integer("tokens_entrada"),
  tokensSaida: integer("tokens_saida"),
  custoEstimadoUsd: real("custo_estimado_usd"),
  duracaoMs: integer("duracao_ms"),
  estado: text("estado").notNull(),                         // ok | erro
  erro: text("erro"),
  httpStatus: integer("http_status"),
  detalhes: jsonb("detalhes"),                              // relatório (validação) — nunca contém chave nem conteúdo de transcrição
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ia_uso_quando_idx").on(t.quando)]);

// ---------------------------------------------------------------------------
// Fase 6 (T-190, autorizada em 10/11/2026): aprovações internas de entregáveis. Registro interno, sem acesso externo.
// Entregável ligado a projeto/cliente do Vobi (só leitura), versões numeradas, aprovação interna (coordenação/gestão) e
// aprovação do cliente sempre com evidência (e-mail, mensagem, ata, item de reunião) — nunca presumida. Histórico imutável.
// ---------------------------------------------------------------------------
export const entregaveis = pgTable("entregavel", {
  id: serial("id").primaryKey(),
  projetoCodigo: integer("projeto_codigo").notNull(),
  clienteCodigo: integer("cliente_codigo"),
  titulo: text("titulo").notNull(),
  tipo: text("tipo").notNull(),                             // layout | apresentacao | executivo | imagens3d | legal | documentacao | outro
  descricao: text("descricao"),
  responsavelId: integer("responsavel_id").references(() => usuarios.id),
  status: text("status").notNull().default("em_elaboracao"), // em_elaboracao | revisao_interna | aprovado_interno | enviado_cliente | aprovado_cliente | ajustes_cliente | cancelado
  versaoAtual: integer("versao_atual").notNull().default(0),
  reuniaoId: integer("reuniao_id"),                         // reunião de apresentação (opcional)
  criadoPor: integer("criado_por").notNull().references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entregavel_projeto_idx").on(t.projetoCodigo), index("entregavel_status_idx").on(t.status)]);

export const versoesEntregavel = pgTable("entregavel_versao", {
  id: serial("id").primaryKey(),
  entregavelId: integer("entregavel_id").notNull().references(() => entregaveis.id),
  numero: integer("numero").notNull(),
  descricao: text("descricao"),                             // o que mudou nesta versão
  link: text("link"),                                       // Drive/Vobi/outro (opcional)
  nomeArquivo: text("nome_arquivo"),
  tipoMime: text("tipo_mime"),
  tamanho: integer("tamanho"),
  conteudo: bytea("conteudo"),                              // arquivo opcional (até 15 MB), protegido pelas permissões do projeto
  enviadoPor: integer("enviado_por").notNull().references(() => usuarios.id),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entregavel_versao_idx").on(t.entregavelId)]);

/** Decisões sobre um entregável: interna (coordenação/gestão) ou do cliente (com evidência obrigatória). */
export const aprovacoesEntregavel = pgTable("entregavel_aprovacao", {
  id: serial("id").primaryKey(),
  entregavelId: integer("entregavel_id").notNull().references(() => entregaveis.id),
  versaoNumero: integer("versao_numero").notNull(),
  instancia: text("instancia").notNull(),                   // interna | cliente
  decisao: text("decisao").notNull(),                       // aprovado | ajustes | reprovado
  observacao: text("observacao"),
  // evidência (obrigatória para cliente): como a aprovação chegou
  evidenciaTipo: text("evidencia_tipo"),                    // email | mensagem | ata | item_reuniao | documento_assinado | verbal_registrada | outro
  evidenciaTexto: text("evidencia_texto"),                  // trecho/transcrição da evidência (texto)
  evidenciaData: text("evidencia_data"),                    // AAAA-MM-DD em que o cliente aprovou
  evidenciaQuem: text("evidencia_quem"),                    // quem aprovou pelo cliente
  itemReuniaoId: integer("item_reuniao_id"),                // item de aprovação de reunião do A360, quando for o caso
  nomeArquivo: text("nome_arquivo"), tipoMime: text("tipo_mime"), tamanho: integer("tamanho"), conteudo: bytea("conteudo"),
  registradoPor: integer("registrado_por").notNull().references(() => usuarios.id),
  registradoEm: timestamp("registrado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entregavel_aprovacao_idx").on(t.entregavelId)]);

export const comentariosEntregavel = pgTable("entregavel_comentario", {
  id: serial("id").primaryKey(),
  entregavelId: integer("entregavel_id").notNull().references(() => entregaveis.id),
  texto: text("texto").notNull(),
  autorId: integer("autor_id").notNull().references(() => usuarios.id),
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entregavel_comentario_idx").on(t.entregavelId)]);

/** Histórico imutável do entregável: só acréscimo. */
export const historicoEntregavel = pgTable("entregavel_historico", {
  id: serial("id").primaryKey(),
  entregavelId: integer("entregavel_id").notNull().references(() => entregaveis.id),
  usuarioId: integer("usuario_id").notNull().references(() => usuarios.id),
  acao: text("acao").notNull(),                             // criado | editado | versao | status | aprovacao_interna | aprovacao_cliente | comentario | cancelado | reaberto
  resumo: text("resumo").notNull(),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entregavel_historico_idx").on(t.entregavelId)]);

// ---------------------------------------------------------------------------
// T-219 — Agenda gerencial das arquitetas + base da integração bidirecional com o Vobi (Fase 0: sem escrita no Vobi).
// ---------------------------------------------------------------------------

/** Espelho das etapas do cronograma (refurbish-step) lidas pela API — identificador real do Vobi. */
export const vobiEtapas = pgTable("vobi_etapa", {
  idVobi: integer("id_vobi").primaryKey(),
  idRefurbish: integer("id_refurbish").notNull(),
  nome: text("nome").notNull(),
  ordem: doublePrecision("ordem"), // o Vobi usa ordem fracionária (ex.: 8.75)
  inicio: timestamp("inicio", { withTimezone: true }),
  fim: timestamp("fim", { withTimezone: true }),
  vistoEm: timestamp("visto_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("vobi_etapa_proj_idx").on(t.idRefurbish)]);

/** Espelho das tarefas do Vobi (task) com o número único — base do vínculo atividade ↔ tarefa. Nunca apagado: ausência é marcada. */
export const vobiTarefas = pgTable("vobi_tarefa", {
  idVobi: integer("id_vobi").primaryKey(),
  idRefurbish: integer("id_refurbish"),
  idEtapa: integer("id_etapa"),
  nome: text("nome").notNull(),
  idResponsavel: integer("id_responsavel"),
  status: integer("status"),
  prioridade: integer("prioridade"),
  inicio: timestamp("inicio", { withTimezone: true }),
  fim: timestamp("fim", { withTimezone: true }),
  duracaoDias: doublePrecision("duracao_dias"), // o Vobi manda fração (ex.: 8.75): guardado como veio
  estimadaHoras: doublePrecision("estimada_horas"),
  realizadasHoras: doublePrecision("realizadas_horas"),
  criadoVobiEm: timestamp("criado_vobi_em", { withTimezone: true }),
  atualizadoVobiEm: timestamp("atualizado_vobi_em", { withTimezone: true }),
  vistoEm: timestamp("visto_em", { withTimezone: true }).notNull().defaultNow(),
  ausenteDesde: timestamp("ausente_desde", { withTimezone: true }),
}, (t) => [index("vobi_tarefa_proj_idx").on(t.idRefurbish), index("vobi_tarefa_resp_idx").on(t.idResponsavel)]);

/** Histórico das mudanças lidas no Vobi (a cada leitura): datas/horários, responsável, etapa, status, prioridade, nome. */
export const vobiTarefaHistorico = pgTable("vobi_tarefa_historico", {
  id: serial("id").primaryKey(),
  idVobi: integer("id_vobi").notNull(),
  campo: text("campo").notNull(),
  antes: text("antes"),
  depois: text("depois"),
  lidoEm: timestamp("lido_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("vobi_tarefa_historico_idx").on(t.idVobi)]);

/** Valores de uma tarefa nos termos do Vobi (o que é comparado e, nas próximas fases, enviado). */
export type CamposVobi = {
  nome?: string; idEtapa?: number | null; idResponsavel?: number | null; inicio?: string | null; fim?: string | null;
  prioridade?: number | null; status?: number | null; duracaoDias?: number | null;
};

/**
 * Atividade programada pela gestão. Independente (só A360) ou vinculada a uma tarefa do Vobi (existente ou a criar).
 * O prazo É a Data de término (fim) — o mesmo campo endDate da tarefa no Vobi (decisão de Rodrigo, 12/11/2026).
 */
export const atividades = pgTable("atividade", {
  id: serial("id").primaryKey(),
  vinculo: text("vinculo").notNull(), // independente | tarefa_existente | nova_tarefa
  tipo: text("tipo").notNull(), // tarefa (vinculadas) | reuniao_interna | treinamento | estudo | alinhamento | administrativa | outra
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  responsavelId: integer("responsavel_id").notNull().references(() => usuarios.id),
  inicio: timestamp("inicio", { withTimezone: true }), // vazio quando a tarefa do Vobi só tem término (preservado como está)
  fim: timestamp("fim", { withTimezone: true }).notNull(),
  diaInteiro: boolean("dia_inteiro").notNull().default(false),
  estimadaHoras: integer("estimada_horas"),
  prioridade: integer("prioridade").notNull().default(2), // 1 Baixa · 2 Média · 3 Alta (códigos do Vobi)
  status: integer("status").notNull().default(1), // 1 Planejado · 2 Em andamento · 4 Concluído · 5 Cancelado (códigos do Vobi)
  projetoCodigo: integer("projeto_codigo"),
  etapaVobiId: integer("etapa_vobi_id"),
  tarefaVobiId: integer("tarefa_vobi_id").unique(), // uma tarefa do Vobi ↔ no máximo uma atividade
  estadoVobi: text("estado_vobi").notNull().default("local"), // local | aguardando_envio | sincronizada | conflito | divergencia
  baseVobi: jsonb("base_vobi").$type<CamposVobi & { atualizadoVobiEm?: string | null }>(), // última versão combinada com o Vobi
  pendentes: jsonb("pendentes").$type<CamposVobi>().notNull().default({}), // mudanças feitas no A360 ainda não enviadas
  conflitos: jsonb("conflitos").$type<Record<string, { a360: unknown; vobi: unknown }>>().notNull().default({}),
  criadoPorId: integer("criado_por_id").references(() => usuarios.id),
  atualizadoPorId: integer("atualizado_por_id").references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("atividade_resp_idx").on(t.responsavelId, t.inicio), index("atividade_proj_idx").on(t.projetoCodigo)]);

export const atividadeHistorico = pgTable("atividade_historico", {
  id: serial("id").primaryKey(),
  atividadeId: integer("atividade_id").notNull().references(() => atividades.id),
  origem: text("origem").notNull(), // a360 | vobi | sistema
  usuarioId: integer("usuario_id").references(() => usuarios.id),
  resumo: text("resumo").notNull(),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("atividade_historico_idx").on(t.atividadeId)]);

export type Simulacao = {
  resultado: "pronto" | "bloqueado";
  metodo: "POST" | "PUT" | null; caminho: string | null; corpo: Record<string, unknown> | null;
  chamadas: number; // chamadas à API que o envio real gastaria (conferência + gravação)
  problemas: { nivel: "bloqueia" | "aviso"; texto: string }[];
};

/** Fila de envio ao Vobi. Fase 0: registros ficam "aguardando" — nada é processado nem enviado (escrita desligada). */
export const vobiEnvios = pgTable("vobi_envio", {
  id: serial("id").primaryKey(),
  atividadeId: integer("atividade_id").notNull().references(() => atividades.id),
  operacao: text("operacao").notNull(), // criar | atualizar | cancelar
  campos: jsonb("campos").$type<CamposVobi>().notNull(),
  estado: text("estado").notNull().default("aguardando"), // aguardando | simulado | enviado | erro | conflito | descartado
  tentativas: integer("tentativas").notNull().default(0),
  resposta: text("resposta"),
  criadoPorId: integer("criado_por_id").references(() => usuarios.id),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  processadoEm: timestamp("processado_em", { withTimezone: true }),
  // Fase 1 (ensaio): o pedido exato que SERIA enviado e os problemas encontrados — nada é enviado
  simulacao: jsonb("simulacao").$type<Simulacao>(),
  simuladoEm: timestamp("simulado_em", { withTimezone: true }),
}, (t) => [index("vobi_envio_ativ_idx").on(t.atividadeId), index("vobi_envio_estado_idx").on(t.estado)]);

// ---------------------------------------------------------------------------
// T-219 — Projetos incorporados sob demanda pela gestão ("Buscar projeto no Vobi", 12/11/2026). Uma linha por pedido.
// Projeto com pedido "integrado" entra no recorte (Agenda, indicadores, sincronização futura) e não é marcado como
// ausente pela carga diária. Só leitura no Vobi.
// ---------------------------------------------------------------------------
export const projetosSobDemanda = pgTable("projeto_sob_demanda", {
  id: serial("id").primaryKey(),
  codigo: integer("codigo").notNull(), // número original do projeto no Vobi
  nome: text("nome").notNull(),
  solicitadoPorId: integer("solicitado_por_id").notNull().references(() => usuarios.id),
  solicitadoEm: timestamp("solicitado_em", { withTimezone: true }).notNull().defaultNow(),
  situacao: text("situacao").notNull(), // integrado | ja_existia | falhou
  detalhe: jsonb("detalhe").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => [index("projeto_sob_demanda_codigo_idx").on(t.codigo)]);

// ---------------------------------------------------------------------------
// T-227 — Motivos da reunião (lista administrada pela gestão; nada é apagado) e histórico de alterações.
// ---------------------------------------------------------------------------
export const motivosReuniao = pgTable("reuniao_motivo", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  chave: text("chave").notNull(),                           // nome normalizado (minúsculas, espaços únicos) — impede duplicidade
  ordem: integer("ordem").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("reuniao_motivo_chave_uq").on(t.chave)]);

export const historicoMotivos = pgTable("reuniao_motivo_historico", {
  id: serial("id").primaryKey(),
  motivoId: integer("motivo_id").references(() => motivosReuniao.id),
  acao: text("acao").notNull(),                             // lista_inicial | incluido | desativado | reativado
  motivoNome: text("motivo_nome").notNull(),
  usuarioId: integer("usuario_id").references(() => usuarios.id), // null = carga inicial da migração
  quando: timestamp("quando", { withTimezone: true }).notNull().defaultNow(),
});
