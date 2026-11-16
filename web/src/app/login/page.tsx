import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Architecture 360" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-[var(--vinho)] p-12 text-white lg:flex" aria-hidden="true">
        <div>{/* eslint-disable-next-line @next/next/no-img-element -- logotipo oficial em rosé sobre vinho (Caderno de Marca) */}<img src="/marca/rucelle-rose.png" alt="" width={512} height={139} className="block h-auto w-40" /><span className="mt-3 block text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-[#f7cfc4]">Architecture 360</span></div>
        <div className="max-w-md">
          <p className="display text-[2rem] leading-[1.2] !text-white">Central de trabalho da operação de arquitetura.</p>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-[#f1dcd5]">Projetos, tarefas e clientes lidos do Vobi, prazos de hoje e sinais para a gestão — sem alterar nada na fonte.</p>
        </div>
        <p className="text-[0.72rem] text-[#f7cfc4]">Acesso restrito à equipe.</p>
      </section>
      <section className="flex items-center justify-center p-6" style={{ background: "var(--rose-2)" }}>
        <div className="card w-full max-w-sm p-8">
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- logotipo oficial */}<img src="/marca/rucelle-vinho.png" alt="rucelle Arquitetura Fitness" width={512} height={139} className="mb-4 block h-auto w-32 lg:hidden" />
            <h1 className="display text-[1.5rem] leading-tight">Entrar</h1>
            <p className="mt-1 text-[0.85rem] text-[var(--txt-2)]">Use o e-mail e a senha cadastrados pelo administrador.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
