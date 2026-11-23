import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar — Architecture 360" };

const ERROS: Record<string, string> = {
  google_sem_cadastro: "Essa conta Google não tem acesso ao A360. Peça o cadastro à Thaís ou ao administrador.",
  google_inativo: "Seu acesso está desativado. Fale com a Thaís ou com o administrador.",
  google_conta: "Use sua conta Google da rucelle (@rucelle.com.br).",
  google_cancelado: "A entrada pelo Google foi cancelada. Tente de novo.",
  google_state: "A entrada não pôde ser confirmada. Tente de novo.",
  google_falhou: "Não foi possível entrar pelo Google agora. Tente de novo em instantes.",
  google_indisponivel: "A entrada pelo Google ainda não está disponível neste ambiente.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const erro = ERROS[(await searchParams).erro ?? ""];
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
            <p className="mt-1 text-[0.85rem] text-[var(--txt-2)]">Entre com sua conta Google da rucelle. Quem tem senha também pode usar e-mail e senha.</p>
          </div>
          {erro && <div className="mb-4 rounded-lg border border-[#f1c2b8] bg-[#fbe9e5] px-3 py-2 text-[0.82rem] text-[#7d2416]" role="alert">{erro}</div>}
          <a href="/api/login/google" className="btn btn-primary mb-5 flex w-full items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#fff" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.6 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.48C16.68 3.7 14.55 2.8 12 2.8 6.92 2.8 2.8 6.92 2.8 12S6.92 21.2 12 21.2c6.92 0 9.2-4.86 9.2-7.36 0-.5-.05-.88-.12-1.26z"/></svg>
            Entrar com Google (@rucelle.com.br)
          </a>
          <div className="mb-4 flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.16em] text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />ou com senha<span className="h-px flex-1 bg-[var(--line)]" /></div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
