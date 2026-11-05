import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Architecture 360" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="side relative hidden flex-col justify-between p-12 lg:flex" aria-hidden="true">
        <div><span className="display text-[2.4rem] text-white">rucelle</span><span className="mt-1 block text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-[#d7a99b]">Architecture 360 · Arquitetura</span></div>
        <div className="max-w-md">
          <p className="display text-[2.3rem] leading-[1.15] text-white">Leitura gerencial da operação de arquitetura.</p>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-[#f1dcd5]">Projetos e tarefas lidos do Vobi, qualidade dos dados e sinais para a gestão — sem alterar nada na fonte.</p>
        </div>
        <p className="text-[0.72rem] text-[#d7a99b]">Acesso restrito à equipe.</p>
      </section>
      <section className="flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg, var(--rose-2) 0%, var(--bg) 55%)" }}>
        <div className="card w-full max-w-sm p-8">
          <div className="mb-6">
            <div className="eyebrow mb-1.5 lg:hidden">rucelle · Architecture 360</div>
            <h1 className="display text-[1.9rem] leading-tight">Entrar</h1>
            <p className="mt-1 text-[0.85rem] text-[var(--txt-2)]">Use o e-mail e a senha cadastrados pelo administrador.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
