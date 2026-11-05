// Cria um usuário do Architecture 360 sem expor a senha em argumentos, histórico ou logs.
// Uso: node scripts/criar-usuario.mjs "Nome" email@rucelle.com.br perfil
//   perfil: admin | gestao | coordenacao | arquiteta
//   A senha é pedida no terminal com digitação oculta, ou lida da variável USUARIO_SENHA (não é impressa).
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import bcrypt from "bcryptjs";
import pg from "pg";

const [nome, email, perfil] = process.argv.slice(2);
const perfis = ["admin", "gestao", "coordenacao", "arquiteta"];
if (!nome || !email || !perfis.includes(perfil ?? "")) {
  console.error('uso: node scripts/criar-usuario.mjs "Nome" email perfil   (perfil: admin|gestao|coordenacao|arquiteta)');
  process.exit(1);
}
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL não definida"); process.exit(1); }

function perguntarOculto(pergunta) {
  return new Promise((resolve) => {
    const rl = createInterface({ input, output, terminal: true });
    const anterior = rl._writeToOutput;
    rl.question(pergunta, (resp) => { rl._writeToOutput = anterior; output.write("\n"); rl.close(); resolve(resp); });
    rl._writeToOutput = () => {}; // não ecoa os caracteres digitados
  });
}

let senha = process.env.USUARIO_SENHA;
if (!senha) {
  senha = await perguntarOculto("Senha (não aparece ao digitar): ");
  const conf = await perguntarOculto("Repita a senha: ");
  if (senha !== conf) { console.error("as senhas não conferem"); process.exit(1); }
}
if (!senha || senha.length < 10) { console.error("senha com menos de 10 caracteres"); process.exit(1); }

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  const hash = await bcrypt.hash(senha, 12);
  await pool.query(
    "insert into usuario (nome, email, senha_hash, perfil) values ($1, $2, $3, $4)",
    [nome, email.trim().toLowerCase(), hash, perfil],
  );
  console.log(`usuário ${email.trim().toLowerCase()} (${perfil}) criado`);
} catch (e) {
  console.error(e.code === "23505" ? "já existe usuário com este e-mail" : e.message);
  process.exit(1);
} finally {
  await pool.end();
}
