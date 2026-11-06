import { readFileSync, writeFileSync } from "node:fs";
import { decifrar } from "./crypto.mjs";
/** Uso: node decifrar.mjs <arquivo.dump.enc> <a360-backup-PRIVADA.pem> [saida.dump] */
const [, , enc, chave, saida = "a360.dump"] = process.argv;
if (!enc || !chave) { console.error("uso: node decifrar.mjs <arquivo.dump.enc> <chave-privada.pem> [saida.dump]"); process.exit(1); }
const dados = decifrar(readFileSync(enc), readFileSync(chave, "utf8"));
writeFileSync(saida, dados);
console.log(`decifrado: ${saida} (${dados.length} bytes). Restaure com: pg_restore --no-owner --no-privileges -d <DATABASE_URL_DE_TESTE> ${saida}`);
