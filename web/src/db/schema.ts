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
}, (t) => [index("projeto_chave_nome_idx").on(t.chaveNome)]);

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
