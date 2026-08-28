// Rotina automática do Rastreio: a cada 30 minutos consulta o status de
// todos os códigos pendentes (não entregues, não arquivados) na API da
// Seu Rastreio e atualiza o banco. Roda dentro do servidor Next.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.SEU_RASTREIO_API_KEY) {
    console.log("[rastreio-cron] SEU_RASTREIO_API_KEY ausente; rotina desativada");
    return;
  }

  const { prisma } = await import("@/lib/prisma");
  const { refreshAllPending } = await import("@/lib/rastreio");

  let running = false;
  const run = async () => {
    if (running) return; // rodada anterior ainda em andamento
    running = true;
    try {
      const { checked, failures } = await refreshAllPending(prisma);
      console.log(`[rastreio-cron] ${new Date().toISOString()} — ${checked} códigos consultados, ${failures} falhas`);
    } catch (e: any) {
      console.error("[rastreio-cron] erro:", e.message);
    } finally {
      running = false;
    }
  };

  // primeira rodada 2 min após o boot; depois a cada 30 min
  setTimeout(run, 2 * 60 * 1000);
  setInterval(run, 30 * 60 * 1000);
  console.log("[rastreio-cron] rotina agendada: a cada 30 minutos");
}
