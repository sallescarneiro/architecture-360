import Link from "next/link";
import { MIN_SENHA, exigirUsuario } from "@/lib/auth";
import { sairAction } from "@/app/login/actions";
import { Alert } from "@/components/ui";
import { TrocarSenhaForm } from "./form";

export const metadata = { title: "Minha senha — Architecture 360" };

/** T-205 — troca da própria senha. Fica fora do chrome autenticado para servir também ao primeiro acesso (troca obrigatória). */
export default async function SenhaPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6" style={{ background: "linear-gradient(160deg, var(--rose-2) 0%, var(--bg) 55%)" }}>
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6">
          <div className="eyebrow mb-1.5">rucelle · Architecture 360</div>
          <h1 className="display text-[1.5rem] leading-tight">{u.trocarSenha ? "Defina sua senha" : "Minha senha"}</h1>
          <p className="mt-1 text-[0.85rem] text-[var(--txt-2)]">
            {u.trocarSenha ? <>Olá, {u.nome.split(" ")[0]}. Você entrou com uma senha provisória; escolha uma senha sua para continuar.</> : <>Conectado como {u.email}.</>}
          </p>
        </div>
        {sp.ok && <div className="mb-4"><Alert kind="success">Senha alterada. As outras sessões abertas com a senha antiga foram encerradas.</Alert></div>}
        <TrocarSenhaForm min={MIN_SENHA} />
        <div className="mt-5 flex items-center justify-between text-[0.8rem]">
          {u.trocarSenha ? <span className="text-[var(--muted)]">A troca é obrigatória no primeiro acesso.</span> : <Link href="/meu-dia" className="link">← Voltar ao Meu dia</Link>}
          <form action={sairAction}><button className="btn btn-ghost btn-sm">Sair</button></form>
        </div>
      </div>
    </main>
  );
}
