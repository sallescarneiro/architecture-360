import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { exigirUsuario, podeImportar } from "@/lib/auth";
import { mapearPessoaAction } from "./actions";

export default async function PessoasPage() {
  const u = await exigirUsuario(["admin", "gestao", "coordenacao"]);
  const pessoas = await db.select().from(schema.pessoasVobi).orderBy(asc(schema.pessoasVobi.origem), asc(schema.pessoasVobi.nomeVobi));
  const edita = podeImportar(u.perfil);
  return (
    <div className="flex flex-col gap-4">
      <div><h1 className="text-2xl font-bold">Pessoas</h1><p className="text-sm text-[var(--muted)]">Nome como aparece no Vobi → e-mail @rucelle (chave comum com o People). Nunca inferido: sem e-mail, a pessoa fica fora dos indicadores individuais.</p></div>
      <div className="card"><table className="w-full text-sm"><thead><tr><th>Nome no Vobi</th><th>E-mail</th><th>Origem</th>{edita && <th></th>}</tr></thead><tbody>
        {pessoas.map((p) => (
          <tr key={p.nomeVobi}><td>{p.nomeVobi}</td>
            <td>{edita ? <form action={mapearPessoaAction} className="flex gap-2"><input type="hidden" name="nome" value={p.nomeVobi} /><input name="email" defaultValue={p.emailRucelle ?? ""} placeholder="nome.sobrenome@rucelle.com.br" className="rounded-md border border-[var(--line)] px-2 py-1 w-72" /><button className="btn btn-secondary py-1">Salvar</button></form> : (p.emailRucelle ?? "—")}</td>
            <td><span className={`badge ${p.origem === "nao_mapeada" ? "badge-warn" : ""}`}>{p.origem}</span></td>
            {edita && <td></td>}
          </tr>))}
      </tbody></table></div>
    </div>
  );
}
