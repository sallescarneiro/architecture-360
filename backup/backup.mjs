import { execFileSync } from "node:child_process";
import { createHash, createSign } from "node:crypto";
import { cifrar } from "./crypto.mjs";

/**
 * Backup completo do PostgreSQL do Architecture 360.
 *   1. pg_dump -Fc (formato custom, comprimido) pela rede privada do Railway (DATABASE_URL).
 *   2. Cifra com a chave pública (BACKUP_PUBLIC_KEY). O texto claro nunca sai deste processo.
 *   3. Envia para a pasta restrita do Google Drive (conta de serviço: GDRIVE_SA_JSON, pasta: GDRIVE_FOLDER_ID).
 *   4. Retenção: diários por RETENCAO_DIAS (30); o backup do dia 1 de cada mês fica por RETENCAO_MENSAL_MESES (12).
 * Nunca registra credenciais nem conteúdo: só nome, tamanho e sha256.
 * Sai com código 1 em qualquer falha, para o Railway marcar a execução como erro.
 */
const env = (k, obrig = true) => { const v = process.env[k]; if (obrig && !v) { console.error(`variável ${k} ausente`); process.exit(1); } return v; };
const DATABASE_URL = env("DATABASE_URL");
const PUB = env("BACKUP_PUBLIC_KEY").replace(/\\n/g, "\n");
const SA = JSON.parse(env("GDRIVE_SA_JSON"));
const FOLDER = env("GDRIVE_FOLDER_ID");
const RET_DIAS = Number(process.env.RETENCAO_DIAS || 30), RET_MESES = Number(process.env.RETENCAO_MENSAL_MESES || 12);

const agora = new Date();
const carimbo = agora.toISOString().replace(/[:T]/g, "-").slice(0, 16); // 2026-11-06-09-05
const nome = `a360-${carimbo}.dump.enc`;

// 1. dump
const dump = execFileSync("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--dbname", DATABASE_URL], { maxBuffer: 2 * 1024 ** 3 });
if (dump.length < 10_000) { console.error(`dump suspeito: ${dump.length} bytes`); process.exit(1); }
// 2. cifra
const enc = cifrar(dump, PUB);
const sha = createHash("sha256").update(enc).digest("hex");
console.log(`dump ${dump.length} bytes → cifrado ${enc.length} bytes · sha256 ${sha}`);

// 3. Google Drive (conta de serviço, JWT RS256 → access token)
async function token() {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const iat = Math.floor(Date.now() / 1000);
  const c = Buffer.from(JSON.stringify({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 })).toString("base64url");
  const s = createSign("RSA-SHA256"); s.update(`${h}.${c}`);
  const jwt = `${h}.${c}.${s.sign(SA.private_key, "base64url")}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  if (!r.ok) throw new Error(`token Google: HTTP ${r.status}`);
  return (await r.json()).access_token;
}
const tk = await token();
const auth = { authorization: `Bearer ${tk}` };

const meta = JSON.stringify({ name: nome, parents: [FOLDER], description: `Backup A360 (pg_dump custom, cifrado). sha256=${sha}` });
const boundary = "a360" + Date.now();
const corpo = Buffer.concat([
  Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
  enc, Buffer.from(`\r\n--${boundary}--`),
]);
const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size", {
  method: "POST", headers: { ...auth, "content-type": `multipart/related; boundary=${boundary}` }, body: corpo,
});
if (!up.ok) { console.error(`upload Drive: HTTP ${up.status} ${await up.text()}`); process.exit(1); }
const criado = await up.json();
if (Number(criado.size) !== enc.length) { console.error(`tamanho no Drive (${criado.size}) difere do enviado (${enc.length})`); process.exit(1); }
console.log(`enviado ao Drive: ${criado.name} (${criado.size} bytes, id ${criado.id})`);

// 4. retenção
const q = encodeURIComponent(`'${FOLDER}' in parents and name contains 'a360-' and trashed = false`);
const lista = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: auth });
if (lista.ok) {
  const { files } = await lista.json();
  let removidos = 0;
  for (const f of files) {
    const m = f.name.match(/^a360-(\d{4})-(\d{2})-(\d{2})-/); if (!m) continue;
    const data = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    const idadeDias = (agora - data) / 86_400_000;
    const mensal = m[3] === "01";
    const vence = mensal ? idadeDias > RET_MESES * 31 : idadeDias > RET_DIAS;
    if (vence && f.id !== criado.id) {
      const del = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, { method: "DELETE", headers: auth });
      if (del.ok) removidos++; else console.error(`não removeu ${f.name}: HTTP ${del.status}`);
    }
  }
  console.log(`retenção: ${files.length} backups na pasta, ${removidos} removidos`);
}
console.log("backup concluído");
