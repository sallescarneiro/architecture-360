import { writeFileSync } from "node:fs";
import { gerarParDeChaves } from "./crypto.mjs";
/** Uso: node gerar-chaves.mjs <pasta-destino>  → grava a360-backup-publica.pem e a360-backup-PRIVADA.pem */
const dir = process.argv[2] || ".";
const { publica, privada } = gerarParDeChaves();
writeFileSync(`${dir}/a360-backup-publica.pem`, publica);
writeFileSync(`${dir}/a360-backup-PRIVADA.pem`, privada, { mode: 0o600 });
console.log("chaves geradas em", dir, "— a PRIVADA nunca vai para o Railway, GitHub ou chat.");
