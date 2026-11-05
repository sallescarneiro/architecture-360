#!/usr/bin/env python3
"""
Architecture 360 — PoC do importador Vobi → A360 (somente leitura do Vobi).

Especificação: "Architecture 360 — Exploração do Vobi e Especificação do Importador — v2.0", seção 1.
Entrada: Projetos.csv e Tarefas.csv exportados manualmente do Vobi (menu Ações › Exportar CSV).
Saída: banco SQLite local com área bruta, modelo consolidado, histórico de alterações e relatório da carga.

Uso:
  python3 importador.py carregar --db a360.sqlite --projetos Projetos.csv --tarefas Tarefas.csv [--enviado-por nome] [--forcar]
  python3 importador.py relatorio --db a360.sqlite [--carga N]
  python3 importador.py pendencias --db a360.sqlite
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict
from difflib import SequenceMatcher
from datetime import date, datetime

# ----------------------------------------------------------------------------
# Layouts esperados (v1 = exportação observada em 04/11/2026)
# ----------------------------------------------------------------------------
LAYOUT_PROJETOS_V1 = [
    "Código", "Nome", "cliente (nome)", "Status", "Criado em", "Data de ganho", "Valor estimado",
    "Valor de ganho", "Metragem", "Expectativa de início", "Descrição", "CEP", "Endereço", "Numero",
    "Complemento", "Cidade", "Estado", "Colaboradores", "Origem", "Empresa", "Etiqueta",
]
LAYOUT_TAREFAS_V1 = [
    "Nome da tarefa", "Etapa", "Projeto", "Data de Início", "Data de Fim", "Descrição", "Horas estimadas",
    "Responsável", "Horas realizadas (em minutos)", "prioridade", "Status",
]

# Parâmetros (seção 4.2 — ajustáveis pela gestão)
LIMIAR_NAO_ENCONTRADOS = 0.15   # fração de "não encontrados" que retém a carga
LIMIAR_LINHAS_MINIMAS = 0.70    # fração de linhas em relação à carga anterior
IDADE_MAXIMA_CARGA_DIAS = 8

# Classificação de status de projeto (texto livre do Vobi → classe)
STATUS_PROJETO_CLASSE = {
    "finalizado": "encerrado",
    "cancelado": "encerrado",
    "pausado": "pausado",
}

# Sinônimos de etapa (seção 1.4) — chave normalizada → etapa canônica
ETAPAS_CANONICAS = {
    "refacao": "Refação",
    "conceito e layout": "Conceito e Layout",
    "conceito & layout": "Conceito e Layout",
    "conceito/layout": "Conceito e Layout",
    "layout & conceito": "Conceito e Layout",
    "imagens 3d": "Imagens 3D",
    "caderno consultoria": "Caderno Consultoria",
    "projeto executivo civil": "Projeto Executivo Civil",
    "executivo obra civil": "Projeto Executivo Civil",
    "projeto de detalhamento de interiores": "Detalhamento de Interiores",
    "detalhamento de interiores": "Detalhamento de Interiores",
    "pn": "Programa de Necessidades",
    "programa de necessidades": "Programa de Necessidades",
    "documentacao": "Documentação",
    "projeto legal": "Projeto Legal",
    "geral": "Geral",
}

# Semente do mapeamento nome → e-mail (tela Equipe do Vobi, 04/11/2026)
PESSOAS_SEMENTE = {
    "Marília Reck Tegner": "marilia.tegner@rucelle.com.br",
    "Pietra Consoli Di Nizo": "pietra.consoli@rucelle.com.br",
    "Andressa Ferreira": "andressa.ferreira@rucelle.com.br",
    "Ana Batitucci": "ana.batitucci@rucelle.com.br",
    "Maiara Bernardi Mascarenhas": "maiara.bernardi@rucelle.com.br",
    "Amanda Monteiro": "amanda.monteiro@rucelle.com.br",
    "Giovanna Cortez": "giovanna.machado@rucelle.com.br",
    "Tatiana Barra": "financeiro@flaviarucelle.com",
    "Ana Paula Zambetti": "anapaula.zambetti@rucelle.com.br",
    "Luryan Nunes": "luryan.nunes@rucelle.com.br",
    "Isys Monteiro": "isys.monteiro@rucelle.com.br",
    "Thais Valle": "thais.valle@rucelle.com.br",
    "Rodrigo Carneiro": "rodrigo.carneiro@rucelle.com.br",   # titular da conta (não listado na tela Equipe)
}

CAMPOS_MONITORADOS_PROJETO = ["nome", "cliente", "status", "status_classe", "metragem", "etiquetas", "colaboradores"]
CAMPOS_MONITORADOS_TAREFA = ["status", "data_inicio", "data_fim", "responsavel_nome", "horas_estimadas_min",
                             "horas_realizadas_min", "prioridade", "etapa_canonica"]


# ----------------------------------------------------------------------------
# Normalização (seção 1.4)
# ----------------------------------------------------------------------------
def sem_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def chave_texto(s: str) -> str:
    """Comparação sem acentos, sem caixa, sem espaços duplicados."""
    return re.sub(r"\s+", " ", sem_acentos(s or "").strip().lower())


def limpar(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def etapa_canonica(etapa: str) -> tuple[str, bool]:
    k = chave_texto(etapa)
    k = re.sub(r"^\d{2}\s*:\s*", "", k)          # prefixo numérico de template: "04: ..."
    k = re.sub(r"\s*/\s*", "/", k)                 # "conceito/ layout" → "conceito/layout"
    if k in ETAPAS_CANONICAS:
        return ETAPAS_CANONICAS[k], True
    return limpar(etapa) or "(vazia)", False


RE_REVISAO = re.compile(r"\bR(\d{2})\b", re.IGNORECASE)


def extrair_revisao(nome: str) -> int | None:
    m = RE_REVISAO.search(nome or "")
    return int(m.group(1)) if m else None


def data_iso(s: str) -> str | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return datetime.strptime(s, "%d/%m/%Y").date().isoformat()
    except ValueError:
        return None


def horas_para_minutos(s: str) -> tuple[int | None, str | None]:
    """'h:mm' → minutos. Inteiro puro → minutos (registra aviso de layout). Vazio → None."""
    s = (s or "").strip()
    if not s:
        return None, None
    if re.fullmatch(r"\d+:\d{2}", s):
        h, m = s.split(":")
        return int(h) * 60 + int(m), None
    if re.fullmatch(r"\d+", s):
        return int(s), "horas_em_inteiro"
    return None, f"horas_formato_desconhecido:{s}"


def lista_virgula(s: str) -> list[str]:
    return [limpar(x) for x in (s or "").split(",") if limpar(x)]


def metragem_num(s: str) -> float | None:
    s = (s or "").strip().replace(".", "").replace(",", ".")
    try:
        return float(s) if s else None
    except ValueError:
        return None


# ----------------------------------------------------------------------------
# Banco
# ----------------------------------------------------------------------------
SCHEMA = """
CREATE TABLE IF NOT EXISTS carga (
  id INTEGER PRIMARY KEY,
  data_carga TEXT NOT NULL,
  enviado_por TEXT,
  status TEXT NOT NULL,             -- aceita | retida | recusada
  motivo TEXT,
  arq_projetos TEXT, hash_projetos TEXT, linhas_projetos INTEGER,
  arq_tarefas TEXT, hash_tarefas TEXT, linhas_tarefas INTEGER,
  relatorio_json TEXT
);
CREATE TABLE IF NOT EXISTS bruto_projeto (carga_id INTEGER, linha INTEGER, dados_json TEXT);
CREATE TABLE IF NOT EXISTS bruto_tarefa  (carga_id INTEGER, linha INTEGER, dados_json TEXT);

CREATE TABLE IF NOT EXISTS pessoa_vobi (
  nome_vobi TEXT PRIMARY KEY,
  chave_nome TEXT,
  email_rucelle TEXT,
  origem TEXT                      -- semente | manual | nao_mapeada
);

CREATE TABLE IF NOT EXISTS projeto (
  codigo INTEGER PRIMARY KEY,
  nome TEXT, chave_nome TEXT, cliente TEXT, status TEXT, status_classe TEXT,
  criado_em TEXT, metragem REAL, etiquetas TEXT, colaboradores TEXT,
  primeira_carga INTEGER, ultima_carga INTEGER, nao_encontrado_desde INTEGER
);

CREATE TABLE IF NOT EXISTS tarefa (
  chave TEXT PRIMARY KEY,           -- codigo|etapa_canonica_chave|nome_chave|ocorrencia
  projeto_codigo INTEGER,           -- NULL = órfã
  projeto_nome_csv TEXT,
  etapa_csv TEXT, etapa_canonica TEXT, etapa_conhecida INTEGER,
  nome TEXT, nome_chave TEXT, ocorrencia INTEGER, revisao INTEGER,
  status TEXT, prioridade TEXT,
  data_inicio TEXT, data_fim TEXT,
  horas_estimadas_min INTEGER, horas_realizadas_min INTEGER,
  responsavel_nome TEXT, responsavel_email TEXT,
  sem_responsavel INTEGER, sem_inicio INTEGER, sem_fim INTEGER, orfa INTEGER, colisao INTEGER,
  classe_qualidade TEXT,
  primeira_carga INTEGER, ultima_carga INTEGER, nao_encontrado_desde INTEGER, motivo_nao_encontrado TEXT
);

CREATE TABLE IF NOT EXISTS historico_alteracoes (
  id INTEGER PRIMARY KEY,
  carga_id INTEGER, entidade TEXT, chave TEXT, campo TEXT, valor_anterior TEXT, valor_novo TEXT
);

CREATE TABLE IF NOT EXISTS alerta (
  id INTEGER PRIMARY KEY,
  carga_id INTEGER, tipo TEXT, entidade TEXT, chave TEXT, detalhe TEXT
);
"""


def abrir(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    for nome, email in PESSOAS_SEMENTE.items():
        con.execute(
            "INSERT OR IGNORE INTO pessoa_vobi(nome_vobi, chave_nome, email_rucelle, origem) VALUES (?,?,?,?)",
            (nome, chave_texto(nome), email, "semente"),
        )
    con.commit()
    return con


# ----------------------------------------------------------------------------
# Leitura e validação (seção 1.1, etapas 1-3)
# ----------------------------------------------------------------------------
class LayoutInvalido(Exception):
    pass


def ler_csv(caminho: str, layout: list[str]) -> tuple[list[dict], str, str]:
    with open(caminho, "rb") as f:
        raw = f.read()
    h = hashlib.sha256(raw).hexdigest()
    texto = raw.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(texto), delimiter=";", quotechar='"')
    cabecalho = [c.strip() for c in (reader.fieldnames or [])]
    if cabecalho != layout:
        raise LayoutInvalido(
            f"{caminho}: cabeçalho diferente do layout v1.\n  esperado: {layout}\n  recebido: {cabecalho}"
        )
    linhas = [dict(r) for r in reader]
    return linhas, h, "v1"


# ----------------------------------------------------------------------------
# Carga
# ----------------------------------------------------------------------------
def carregar(db: str, arq_projetos: str, arq_tarefas: str, enviado_por: str | None, forcar: bool,
             data_carga: str | None = None) -> dict:
    con = abrir(db)
    rel: dict = {"alertas": [], "avisos_layout": []}
    data_carga = data_carga or date.today().isoformat()

    # 1-2. recepção e validação
    try:
        proj_linhas, hp, _ = ler_csv(arq_projetos, LAYOUT_PROJETOS_V1)
        tar_linhas, ht, _ = ler_csv(arq_tarefas, LAYOUT_TAREFAS_V1)
    except LayoutInvalido as e:
        con.execute("INSERT INTO carga(data_carga, enviado_por, status, motivo) VALUES (?,?,?,?)",
                    (data_carga, enviado_por, "recusada", str(e)))
        con.commit()
        return {"status": "recusada", "motivo": str(e)}

    anterior = con.execute("SELECT * FROM carga WHERE status='aceita' ORDER BY id DESC LIMIT 1").fetchone()
    if anterior and anterior["hash_projetos"] == hp and anterior["hash_tarefas"] == ht and not forcar:
        return {"status": "ignorada", "motivo": "carga idêntica à última aceita (mesmo hash)",
                "carga_anterior": anterior["id"]}

    # Tudo ou nada a partir daqui
    try:
        con.execute("BEGIN")
        cur = con.execute(
            "INSERT INTO carga(data_carga, enviado_por, status, arq_projetos, hash_projetos, linhas_projetos,"
            " arq_tarefas, hash_tarefas, linhas_tarefas) VALUES (?,?,?,?,?,?,?,?,?)",
            (data_carga, enviado_por, "em_processamento", arq_projetos, hp, len(proj_linhas),
             arq_tarefas, ht, len(tar_linhas)))
        carga_id = cur.lastrowid

        # 3. área bruta
        con.executemany("INSERT INTO bruto_projeto VALUES (?,?,?)",
                        [(carga_id, i + 2, json.dumps(r, ensure_ascii=False)) for i, r in enumerate(proj_linhas)])
        con.executemany("INSERT INTO bruto_tarefa VALUES (?,?,?)",
                        [(carga_id, i + 2, json.dumps(r, ensure_ascii=False)) for i, r in enumerate(tar_linhas)])

        # ---------------- Projetos (seção 1.2) ----------------
        proj_novos = proj_alt = 0
        codigos_carga: set[int] = set()
        por_nome: dict[str, list[dict]] = defaultdict(list)
        for r in proj_linhas:
            try:
                codigo = int(r["Código"])
            except (ValueError, TypeError):
                _alerta(con, carga_id, "projeto_sem_codigo", "projeto", r.get("Nome", ""), "linha ignorada")
                continue
            status = limpar(r["Status"])
            novo = {
                "nome": limpar(r["Nome"]), "chave_nome": chave_texto(r["Nome"]),
                "cliente": limpar(r["cliente (nome)"]), "status": status,
                "status_classe": STATUS_PROJETO_CLASSE.get(chave_texto(status), "ativo"),
                "criado_em": data_iso(r["Criado em"]), "metragem": metragem_num(r["Metragem"]),
                "etiquetas": json.dumps([limpar(x) for x in r["Etiqueta"].split(",") if limpar(x)], ensure_ascii=False),
                "colaboradores": json.dumps(lista_virgula(r["Colaboradores"]), ensure_ascii=False),
            }
            for nome_col in lista_virgula(r["Colaboradores"]):
                _garantir_pessoa(con, carga_id, nome_col)
            codigos_carga.add(codigo)
            por_nome[novo["chave_nome"]].append({"codigo": codigo, **novo})
            atual = con.execute("SELECT * FROM projeto WHERE codigo=?", (codigo,)).fetchone()
            if atual is None:
                con.execute(
                    "INSERT INTO projeto(codigo,nome,chave_nome,cliente,status,status_classe,criado_em,metragem,"
                    "etiquetas,colaboradores,primeira_carga,ultima_carga) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (codigo, novo["nome"], novo["chave_nome"], novo["cliente"], novo["status"], novo["status_classe"],
                     novo["criado_em"], novo["metragem"], novo["etiquetas"], novo["colaboradores"], carga_id, carga_id))
                proj_novos += 1
            else:
                mudou = _registrar_diferencas(con, carga_id, "projeto", str(codigo), atual, novo, CAMPOS_MONITORADOS_PROJETO)
                con.execute(
                    "UPDATE projeto SET nome=?,chave_nome=?,cliente=?,status=?,status_classe=?,criado_em=?,metragem=?,"
                    "etiquetas=?,colaboradores=?,ultima_carga=?,nao_encontrado_desde=NULL WHERE codigo=?",
                    (novo["nome"], novo["chave_nome"], novo["cliente"], novo["status"], novo["status_classe"],
                     novo["criado_em"], novo["metragem"], novo["etiquetas"], novo["colaboradores"], carga_id, codigo))
                proj_alt += int(mudou)

        # projetos não encontrados nesta carga
        proj_nao_enc = 0
        for p in con.execute("SELECT codigo FROM projeto WHERE ultima_carga<? AND nao_encontrado_desde IS NULL", (carga_id,)):
            con.execute("UPDATE projeto SET nao_encontrado_desde=? WHERE codigo=?", (carga_id, p["codigo"]))
            _alerta(con, carga_id, "projeto_nao_encontrado", "projeto", str(p["codigo"]), "ausente na exportação")
            proj_nao_enc += 1

        # resolução de nome → código (preferindo o ativo; >1 ativo = colisão)
        resolve: dict[str, int | None] = {}
        for k, lst in por_nome.items():
            ativos = [p for p in lst if p["status_classe"] != "encerrado"]
            if len(ativos) == 1:
                resolve[k] = ativos[0]["codigo"]
            elif len(ativos) == 0 and len(lst) == 1:
                resolve[k] = lst[0]["codigo"]
            elif len(ativos) > 1:
                resolve[k] = None
                _alerta(con, carga_id, "projeto_nome_duplicado_ativo", "projeto", k,
                        "códigos: " + ",".join(str(p["codigo"]) for p in ativos))
            else:  # vários encerrados com mesmo nome
                resolve[k] = max(lst, key=lambda p: p["codigo"])["codigo"]

        # ---------------- Tarefas (seção 1.3) ----------------
        tar_novas = tar_alt = tar_orfas = tar_colisoes = 0
        ocorr: dict[tuple, int] = defaultdict(int)
        chaves_carga: set[str] = set()
        novos_por_chave: dict[str, dict] = {}
        for r in tar_linhas:
            nome = limpar(r["Nome da tarefa"])
            nome_proj = limpar(r["Projeto"])
            if not any(limpar(v) for v in r.values()):
                _alerta(con, carga_id, "linha_vazia", "tarefa", "", "linha totalmente vazia; só na área bruta")
                continue
            codigo = resolve.get(chave_texto(nome_proj)) if nome_proj else None
            etapa_c, conhecida = etapa_canonica(r["Etapa"])
            if not conhecida:
                _alerta(con, carga_id, "etapa_a_classificar", "tarefa", nome, f"etapa '{limpar(r['Etapa'])}'")
            trio = (codigo if codigo is not None else f"?{chave_texto(nome_proj)}", chave_texto(etapa_c), chave_texto(nome))
            ocorr[trio] += 1
            n = ocorr[trio]
            chave = f"{trio[0]}|{trio[1]}|{trio[2]}|{n}"
            if n > 1:
                tar_colisoes += 1
                _alerta(con, carga_id, "colisao_chave_tarefa", "tarefa", chave, "mesmo projeto+etapa+nome; distinguida por ocorrência")
            est, av1 = horas_para_minutos(r["Horas estimadas"])
            rea, av2 = horas_para_minutos(r["Horas realizadas (em minutos)"])
            for av in (av1, av2):
                if av and av not in rel["avisos_layout"]:
                    rel["avisos_layout"].append(av)
            resp_nome = limpar(r["Responsável"])
            resp_email = _garantir_pessoa(con, carga_id, resp_nome) if resp_nome else None
            di, df = data_iso(r["Data de Início"]), data_iso(r["Data de Fim"])
            orfa = int(codigo is None)
            tar_orfas += orfa
            if orfa:
                _alerta(con, carga_id, "tarefa_orfa", "tarefa", chave, f"projeto '{nome_proj}' não resolvido")
            novo = {
                "projeto_codigo": codigo, "projeto_nome_csv": nome_proj,
                "etapa_csv": limpar(r["Etapa"]), "etapa_canonica": etapa_c, "etapa_conhecida": int(conhecida),
                "nome": nome, "nome_chave": chave_texto(nome), "ocorrencia": n, "revisao": extrair_revisao(nome),
                "status": chave_texto(r["Status"]), "prioridade": chave_texto(r["prioridade"]),
                "data_inicio": di, "data_fim": df,
                "horas_estimadas_min": est, "horas_realizadas_min": rea,
                "responsavel_nome": resp_nome or None, "responsavel_email": resp_email,
                "sem_responsavel": int(not resp_email), "sem_inicio": int(di is None), "sem_fim": int(df is None),
                "orfa": orfa, "colisao": int(n > 1),
            }
            novo["classe_qualidade"] = _classe_qualidade(novo)
            chaves_carga.add(chave)
            novos_por_chave[chave] = novo
            atual = con.execute("SELECT * FROM tarefa WHERE chave=?", (chave,)).fetchone()
            cols = list(novo.keys())
            if atual is None:
                con.execute(
                    f"INSERT INTO tarefa(chave,{','.join(cols)},primeira_carga,ultima_carga) VALUES (?,{','.join('?'*len(cols))},?,?)",
                    (chave, *[novo[c] for c in cols], carga_id, carga_id))
                tar_novas += 1
            else:
                mudou = _registrar_diferencas(con, carga_id, "tarefa", chave, atual, novo, CAMPOS_MONITORADOS_TAREFA)
                con.execute(
                    f"UPDATE tarefa SET {','.join(c+'=?' for c in cols)},ultima_carga=?,nao_encontrado_desde=NULL,motivo_nao_encontrado=NULL WHERE chave=?",
                    (*[novo[c] for c in cols], carga_id, chave))
                tar_alt += int(mudou)

        # tarefas não encontradas (seção 1.8) + sugestão de renomeação
        tar_nao_enc = 0
        sugestoes = []
        nao_encontradas = con.execute(
            "SELECT * FROM tarefa WHERE ultima_carga<? AND nao_encontrado_desde IS NULL", (carga_id,)).fetchall()
        novas_nesta = {k: v for k, v in novos_por_chave.items()
                       if con.execute("SELECT primeira_carga FROM tarefa WHERE chave=?", (k,)).fetchone()[0] == carga_id}
        usadas: set[str] = set()
        for t in nao_encontradas:
            proj = con.execute("SELECT status_classe FROM projeto WHERE codigo=?", (t["projeto_codigo"],)).fetchone()
            motivo = "projeto encerrado" if (proj and proj["status_classe"] == "encerrado") else "possível exclusão ou renomeação"
            con.execute("UPDATE tarefa SET nao_encontrado_desde=?, motivo_nao_encontrado=? WHERE chave=?",
                        (carga_id, motivo, t["chave"]))
            tar_nao_enc += 1
            if motivo != "projeto encerrado":
                melhor, melhor_sim = None, 0.0
                for k, v in novas_nesta.items():
                    if k in usadas:
                        continue
                    if (v["projeto_codigo"] == t["projeto_codigo"] and v["etapa_canonica"] == t["etapa_canonica"]
                            and v["data_inicio"] == t["data_inicio"] and v["data_fim"] == t["data_fim"]
                            and v["responsavel_nome"] == t["responsavel_nome"]
                            and v["horas_realizadas_min"] == t["horas_realizadas_min"]):
                        sim = SequenceMatcher(None, t["nome_chave"], v["nome_chave"]).ratio()
                        if sim > melhor_sim:
                            melhor, melhor_sim = k, sim
                if melhor and melhor_sim >= 0.6:   # mesmos atributos e nome parecido: uma sugestão por tarefa nova
                    usadas.add(melhor)
                    sugestoes.append({"nao_encontrada": t["chave"], "nova": melhor, "similaridade_nome": round(melhor_sim, 2)})
                    _alerta(con, carga_id, "possivel_renomeacao", "tarefa", t["chave"], f"candidata: {melhor}")
            _alerta(con, carga_id, "tarefa_nao_encontrada", "tarefa", t["chave"], motivo)

        # carga anômala (seção 1.8)
        retida = None
        if anterior:
            total_ant = anterior["linhas_tarefas"] or 0
            frac_ne = tar_nao_enc / total_ant if total_ant else 0
            frac_linhas = len(tar_linhas) / anterior["linhas_tarefas"] if anterior["linhas_tarefas"] else 1
            if frac_ne > LIMIAR_NAO_ENCONTRADOS:
                retida = f"não encontrados {frac_ne:.0%} > {LIMIAR_NAO_ENCONTRADOS:.0%} (provável exportação filtrada)"
            elif frac_linhas < LIMIAR_LINHAS_MINIMAS:
                retida = f"linhas {frac_linhas:.0%} da carga anterior < {LIMIAR_LINHAS_MINIMAS:.0%}"

        qual = {row[0]: row[1] for row in con.execute(
            "SELECT classe_qualidade, COUNT(*) FROM tarefa WHERE ultima_carga=? GROUP BY classe_qualidade", (carga_id,))}
        rel.update({
            "carga_id": carga_id, "data_carga": data_carga,
            "projetos": {"linhas": len(proj_linhas), "novos": proj_novos, "alterados": proj_alt, "nao_encontrados": proj_nao_enc,
                         "por_status": dict(con.execute("SELECT status, COUNT(*) FROM projeto WHERE ultima_carga=? GROUP BY status", (carga_id,)).fetchall())},
            "tarefas": {"linhas": len(tar_linhas), "novas": tar_novas, "alteradas": tar_alt, "nao_encontradas": tar_nao_enc,
                        "orfas": tar_orfas, "colisoes": tar_colisoes,
                        "por_status": dict(con.execute("SELECT status, COUNT(*) FROM tarefa WHERE ultima_carga=? GROUP BY status", (carga_id,)).fetchall()),
                        "qualidade": qual},
            "possiveis_renomeacoes": sugestoes,
            "pessoas_nao_mapeadas": [r[0] for r in con.execute("SELECT nome_vobi FROM pessoa_vobi WHERE origem='nao_mapeada'")],
            "alertas_por_tipo": dict(con.execute("SELECT tipo, COUNT(*) FROM alerta WHERE carga_id=? GROUP BY tipo", (carga_id,)).fetchall()),
        })

        if retida:
            # Retida: nada do modelo consolidado é mantido; registra-se apenas a carga com motivo.
            con.execute("ROLLBACK")
            con.execute("INSERT INTO carga(data_carga, enviado_por, status, motivo, arq_projetos, hash_projetos, linhas_projetos,"
                        " arq_tarefas, hash_tarefas, linhas_tarefas, relatorio_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                        (data_carga, enviado_por, "retida", retida, arq_projetos, hp, len(proj_linhas), arq_tarefas, ht,
                         len(tar_linhas), json.dumps(rel, ensure_ascii=False)))
            con.commit()
            rel["status"] = "retida"
            rel["motivo"] = retida
            return rel

        con.execute("UPDATE carga SET status='aceita', relatorio_json=? WHERE id=?", (json.dumps(rel, ensure_ascii=False), carga_id))
        con.execute("COMMIT")
        rel["status"] = "aceita"
        return rel
    except Exception:
        con.execute("ROLLBACK")
        raise


def _classe_qualidade(t: dict) -> str:
    if t["orfa"]:
        return "orfa"
    if t["status"] == "cancelado":
        return "encerrada"
    if t["sem_responsavel"]:
        return "incompleta_sem_responsavel"
    if t["sem_fim"]:
        return "incompleta_sem_prazo"
    if t["sem_inicio"]:
        return "incompleta_sem_inicio"
    return "completa"


def _garantir_pessoa(con, carga_id: int, nome: str) -> str | None:
    k = chave_texto(nome)
    row = con.execute("SELECT email_rucelle, origem FROM pessoa_vobi WHERE chave_nome=?", (k,)).fetchone()
    if row:
        return row["email_rucelle"]
    con.execute("INSERT OR IGNORE INTO pessoa_vobi(nome_vobi, chave_nome, email_rucelle, origem) VALUES (?,?,NULL,'nao_mapeada')",
                (nome, k))
    _alerta(con, carga_id, "pessoa_nao_mapeada", "pessoa", nome, "sem e-mail; mapear manualmente")
    return None


def _registrar_diferencas(con, carga_id, entidade, chave, atual, novo, campos) -> bool:
    mudou = False
    for c in campos:
        a, n = atual[c], novo[c]
        if (a if a is not None else "") != (n if n is not None else ""):
            con.execute("INSERT INTO historico_alteracoes(carga_id,entidade,chave,campo,valor_anterior,valor_novo) VALUES (?,?,?,?,?,?)",
                        (carga_id, entidade, chave, c, str(a) if a is not None else None, str(n) if n is not None else None))
            mudou = True
    return mudou


def _alerta(con, carga_id, tipo, entidade, chave, detalhe):
    con.execute("INSERT INTO alerta(carga_id,tipo,entidade,chave,detalhe) VALUES (?,?,?,?,?)", (carga_id, tipo, entidade, chave, detalhe))


# ----------------------------------------------------------------------------
# Relatórios
# ----------------------------------------------------------------------------
def relatorio(db: str, carga_id: int | None):
    con = abrir(db)
    if carga_id is None:
        row = con.execute("SELECT * FROM carga ORDER BY id DESC LIMIT 1").fetchone()
    else:
        row = con.execute("SELECT * FROM carga WHERE id=?", (carga_id,)).fetchone()
    if not row:
        print("nenhuma carga"); return
    print(f"Carga {row['id']} — {row['data_carga']} — status: {row['status']}" + (f" — {row['motivo']}" if row["motivo"] else ""))
    if row["relatorio_json"]:
        print(json.dumps(json.loads(row["relatorio_json"]), ensure_ascii=False, indent=2))
    ultima = con.execute("SELECT data_carga FROM carga WHERE status='aceita' ORDER BY id DESC LIMIT 1").fetchone()
    if ultima:
        idade = (date.today() - date.fromisoformat(ultima["data_carga"])).days
        if idade > IDADE_MAXIMA_CARGA_DIAS:
            print(f"ALERTA: última carga aceita tem {idade} dias (> {IDADE_MAXIMA_CARGA_DIAS})")


def pendencias(db: str):
    """Lista 'Dados incompletos na fonte' (seção 2.2)."""
    con = abrir(db)
    ultima = con.execute("SELECT id FROM carga WHERE status='aceita' ORDER BY id DESC LIMIT 1").fetchone()
    if not ultima:
        print("nenhuma carga aceita"); return
    cid = ultima["id"]
    print("== Tarefas incompletas (última carga) por classe ==")
    for r in con.execute("SELECT classe_qualidade, COUNT(*) n FROM tarefa WHERE ultima_carga=? GROUP BY 1 ORDER BY n DESC", (cid,)):
        print(f"  {r[0]:32s} {r[1]}")
    print("== Pessoas não mapeadas ==")
    for r in con.execute("SELECT nome_vobi FROM pessoa_vobi WHERE origem='nao_mapeada'"):
        print("  ", r[0])
    print("== Alertas da carga ==")
    for r in con.execute("SELECT tipo, COUNT(*) FROM alerta WHERE carga_id=? GROUP BY tipo", (cid,)):
        print(f"  {r[0]:32s} {r[1]}")
    print("== Dados incompletos na fonte — projetos com mais tarefas incompletas (top 10; link só para consulta) ==")
    for r in con.execute(
        "SELECT p.codigo, p.nome, COUNT(*) n FROM tarefa t JOIN projeto p ON p.codigo=t.projeto_codigo "
        "WHERE t.ultima_carga=? AND t.classe_qualidade LIKE 'incompleta%' GROUP BY p.codigo ORDER BY n DESC LIMIT 10", (cid,)):
        print(f"  {r['n']:4d}  https://plataforma.vobi.com.br/profissional/projetos/perfil/{r['codigo']}/tarefas  {r['nome']}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("carregar"); c.add_argument("--db", required=True); c.add_argument("--projetos", required=True)
    c.add_argument("--tarefas", required=True); c.add_argument("--enviado-por"); c.add_argument("--forcar", action="store_true")
    c.add_argument("--data-carga", help="AAAA-MM-DD (padrão: hoje)")
    r = sub.add_parser("relatorio"); r.add_argument("--db", required=True); r.add_argument("--carga", type=int)
    p = sub.add_parser("pendencias"); p.add_argument("--db", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "carregar":
        rel = carregar(a.db, a.projetos, a.tarefas, a.enviado_por, a.forcar, a.data_carga)
        print(json.dumps(rel, ensure_ascii=False, indent=2))
        return 0 if rel["status"] in ("aceita", "ignorada") else 1
    if a.cmd == "relatorio":
        relatorio(a.db, a.carga); return 0
    if a.cmd == "pendencias":
        pendencias(a.db); return 0


if __name__ == "__main__":
    sys.exit(main())
