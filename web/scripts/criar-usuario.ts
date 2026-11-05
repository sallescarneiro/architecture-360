// Cria um usuário: npm run usuario -- "Nome" email@rucelle.com.br senha perfil
// perfil: admin | gestao | coordenacao | arquiteta
import { criarUsuario, type Perfil } from "@/lib/auth";
import { pool } from "@/db";

const [nome, email, senha, perfil] = process.argv.slice(2);
if (!nome || !email || !senha || !perfil) {
  console.error('uso: npm run usuario -- "Nome" email senha perfil');
  process.exit(1);
}
criarUsuario(nome, email, senha, perfil as Perfil)
  .then(() => { console.log(`usuário ${email} (${perfil}) criado`); return pool.end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
