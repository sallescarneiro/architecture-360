import { createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes, constants } from "node:crypto";

/**
 * Criptografia híbrida do backup: AES-256-GCM com chave aleatória por arquivo; a chave AES vai
 * cifrada com RSA-OAEP (SHA-256) pela chave PÚBLICA. Só quem tem a chave PRIVADA (Rodrigo) decifra.
 * Formato do arquivo .enc: "A360B1" | len(2 bytes) | chaveAES cifrada | iv(12) | tag(16) | dados cifrados.
 */
const MAGIC = Buffer.from("A360B1");

export function gerarParDeChaves() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 4096 });
  return { publica: publicKey.export({ type: "spki", format: "pem" }), privada: privateKey.export({ type: "pkcs8", format: "pem" }) };
}

export function cifrar(dados, chavePublicaPem) {
  const chave = randomBytes(32), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const corpo = Buffer.concat([c.update(dados), c.final()]);
  const tag = c.getAuthTag();
  const chaveCifrada = publicEncrypt({ key: chavePublicaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, chave);
  const len = Buffer.alloc(2); len.writeUInt16BE(chaveCifrada.length);
  return Buffer.concat([MAGIC, len, chaveCifrada, iv, tag, corpo]);
}

export function decifrar(arquivo, chavePrivadaPem) {
  if (!arquivo.subarray(0, 6).equals(MAGIC)) throw new Error("arquivo não é um backup A360 (cabeçalho inválido)");
  const len = arquivo.readUInt16BE(6);
  let p = 8;
  const chaveCifrada = arquivo.subarray(p, p + len); p += len;
  const iv = arquivo.subarray(p, p + 12); p += 12;
  const tag = arquivo.subarray(p, p + 16); p += 16;
  const chave = privateDecrypt({ key: chavePrivadaPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, chaveCifrada);
  const d = createDecipheriv("aes-256-gcm", chave, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(arquivo.subarray(p)), d.final()]);
}
