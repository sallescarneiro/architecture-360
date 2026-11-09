import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Architecture 360" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between bg-[var(--vinho)] p-12 text-white lg:flex" aria-hidden="true">
        <div><span className="marca text-[1.3rem] text-white">RUCELLE <span>360°</span></span><span className="mt-1 block text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#f7cfc4]">Architecture 360 · Central de Trabalho</span></div>
        <div className="max-w-md">
          <p className="display text-[2rem] leading-[1.2] text-white">Central de trabalho da operação de arquitetura.</p>
          <p className="mt-4 text-[0.92rem] leading-relaxed text-[#f1dcd5]">Projetos, tarefas e clientes lidos do Vobi, prazos de hoje e sinais para a gestão — sem alterar nada na fonte.</p>
        </div>
        <p className="text-[0.72rem] text-[#f7cfc4]">Acesso restrito à equipe.</p>
      </section>
      <section className="flex items-center justify-center p-6" style={{ background: "linear-gradient(160deg, var(--rose-2) 0%, var(--bg) 55%)" }}>
        <div className="card w-full max-w-sm p-8">
          <div className="mb-6">
            <div className="eyebrow mb-1.5 lg:hidden">Rucelle 360° · Architecture 360</div>
            <h1 className="display text-[1.5rem] leading-tight">Entrar</h1>
            <p className="mt-1 text-[0.85rem] text-[var(--txt-2)]">Use o e-mail e a senha cadastrados pelo administrador.</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
