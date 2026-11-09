import {
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
  status: text("status").notNull().default("planejada"),    // planejada | realizada | cancelada
  eventoGoogleId: text("evento_google_id"),                 // id do evento no Google Calendar (quando ligada à Agenda)
  eventoUsuarioId: integer("evento_usuario_id"),            // dono da conexão em que o evento vive
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
