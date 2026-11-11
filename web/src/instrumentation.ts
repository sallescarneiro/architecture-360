// T-218 — agenda da sincronização diária com a API do Vobi, dentro do próprio serviço web (sem serviço extra no Railway).
// Verifica a cada 10 minutos; a regra de horário (06:00 Brasília, uma por dia, novas tentativas se falhar) fica em verificarAgenda().
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.VOBI_SYNC_AUTO === "off") return;
  const { verificarAgenda } = await import("@/lib/vobi/sincronizar");
  const rodar = () => verificarAgenda().catch((e) => console.error("[vobi] agenda:", (e as Error).message));
  setTimeout(rodar, 60_000);
  setInterval(rodar, 10 * 60_000);
}
