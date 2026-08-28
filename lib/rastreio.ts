// Lógica de consulta e classificação de rastreio, compartilhada entre a
// rota /api/rastreio e a rotina automática de 30 em 30 min (instrumentation).
import type { PrismaClient } from "@prisma/client";

// Classifica o texto de status num dos 4 grupos coloridos: postado (azul),
// em_transito (amarelo), barrado (vermelho), entregue (verde).
export function classifyStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/entreg/.test(t)) return "entregue";
  if (/alf[aâ]ndeg|proibid|devolvid|devolu[cç]|extravi|apreendid|taxa[cç][aã]o|tributad|aguardando pagamento|recusad|barrad/.test(t)) return "barrado";
  if (/tr[aâ]nsit|encaminhad|saiu para entrega|chegou|em rota|exporta[cç][aã]o|fiscaliza[cç][aã]o|liberad|distribui/.test(t)) return "em_transito";
  if (/postad|coletado|aceito|admitid|recebido pel/.test(t)) return "postado";
  return null;
}

export interface TrackingResult {
  raw: string;
  category: string | null;
  details: any;
}

// Consulta o status na API pública da Seu Rastreio.
// Limite: 10 req/min por IP; respostas boas ficam 10 min em cache lá.
export async function fetchTrackingStatus(code: string): Promise<TrackingResult | null> {
  const apiKey = process.env.SEU_RASTREIO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://seurastreio.com.br/api/public/rastreio/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429) {
      return { raw: "limite_atingido", category: null, details: { error: "HTTP 429 - limite de consultas atingido" } };
    }
    if (!res.ok) {
      return { raw: "indisponivel", category: null, details: { error: `HTTP ${res.status}` } };
    }
    const data = await res.json();
    if (data.status === "not_found") {
      return { raw: "não encontrado", category: null, details: data };
    }
    if (data.status === "no_events" || !data.eventoMaisRecente) {
      return { raw: "sem eventos ainda", category: null, details: data };
    }
    const ev = data.eventoMaisRecente;
    const raw = [ev.descricao, ev.local].filter(Boolean).join(" — ");
    // BDE/BDI/BDR são os códigos Correios de entrega concluída
    const category = ["BDE", "BDI", "BDR"].includes(ev.codigo) ? "entregue" : classifyStatus(ev.descricao);
    return { raw, category, details: data };
  } catch (e: any) {
    return { raw: "indisponivel", category: null, details: { error: e.message } };
  }
}

export const REFRESH_FAILURES = ["indisponivel", "limite_atingido"];

// Atualiza um registro no banco com o resultado da consulta.
// Falha temporária não apaga um status já conhecido.
export async function refreshOrder(
  prisma: PrismaClient,
  order: { id: string; trackingCode: string; statusRaw: string | null; statusCategory: string | null; statusDetails: string | null }
) {
  const result = await fetchTrackingStatus(order.trackingCode);
  if (!result) return null;
  const failed = REFRESH_FAILURES.includes(result.raw);
  const updated = await prisma.trackingOrder.update({
    where: { id: order.id },
    data: {
      statusRaw: failed && order.statusRaw ? order.statusRaw : result.raw,
      statusCategory: result.category ?? order.statusCategory,
      statusDetails: failed ? order.statusDetails : JSON.stringify(result.details),
      lastCheckedAt: new Date(),
    },
  });
  return { updated, failed, raw: result.raw };
}

// Rotina da atualização automática: consulta todos os pendentes (não
// entregues, não arquivados), um a um, respeitando o limite de 10/min.
export async function refreshAllPending(prisma: PrismaClient): Promise<{ checked: number; failures: number }> {
  // OR explícito porque NOT equals em campo nullable exclui os NULL no SQL —
  // e os sem categoria (ex.: "não encontrado") são justamente os que mais
  // precisam de reconsulta
  const pending = await prisma.trackingOrder.findMany({
    where: {
      archived: false,
      OR: [{ statusCategory: null }, { statusCategory: { not: "entregue" } }],
    },
    orderBy: { lastCheckedAt: "asc" },
    select: { id: true, trackingCode: true, statusRaw: true, statusCategory: true, statusDetails: true },
  });
  let failures = 0;
  for (let i = 0; i < pending.length; i++) {
    const r = await refreshOrder(prisma, pending[i]);
    if (!r || r.failed) failures++;
    if (i < pending.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 6500));
    }
  }
  return { checked: pending.length, failures };
}
