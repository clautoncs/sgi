import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { denied: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), session: null };
  }
  return { denied: null, session };
}

const STATUS_CATEGORIES = ["postado", "em_transito", "barrado", "entregue"];

// Classifica o texto de status retornado pela API (ou digitado manualmente)
// num dos 4 grupos coloridos pedidos: postado (azul), em_transito (amarelo),
// barrado (vermelho - alfândega/proibido/devolvido), entregue (verde).
function classifyStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (/entreg/.test(t)) return "entregue";
  if (/alf[aâ]ndeg|proibid|devolvid|extravi|apreendid|taxa[cç][aã]o/.test(t)) return "barrado";
  if (/tr[aâ]nsit|encaminhad|saiu para entrega|chegou no país|em rota/.test(t)) return "em_transito";
  if (/postad|coletado|objeto postado|aceito pelos correios|admitido/.test(t)) return "postado";
  return null;
}

// Consulta o status de um código de rastreio na API da Site Rastreio.
// Endpoint/formato ainda não confirmados com a chave real — se a chamada
// falhar (config ausente, 4xx/5xx, formato inesperado), devolve status
// "indisponivel" em vez de derrubar a requisição.
async function fetchTrackingStatus(code: string): Promise<{ raw: string; category: string | null; details: any } | null> {
  const apiKey = process.env.SITE_RASTREIO_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.siterastreio.com.br/v1/rastreio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ codigo: code }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { raw: "indisponivel", category: null, details: { error: `HTTP ${res.status}` } };
    }
    const data = await res.json();
    const raw = data.status || data.situacao || "desconhecido";
    return { raw, category: classifyStatus(raw), details: data };
  } catch (e: any) {
    return { raw: "indisponivel", category: null, details: { error: e.message } };
  }
}

function parseBrDate(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  // dd/mm ou dd/mm/aaaa ou dd/mm/aa
  const m = v.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function parseBrMoney(value: string): number | null {
  const v = value.replace(/[Rr]\$/g, "").trim().replace(/\./g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function GET(request: NextRequest) {
  const { denied } = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "true";

  const orders = await prisma.trackingOrder.findMany({
    where: includeArchived ? {} : { archived: false },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json({ orders });
}

export async function POST(request: NextRequest) {
  const { denied, session } = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();

    // Importação em massa: cola direto as linhas copiadas da planilha
    // (colunas separadas por TAB, na ordem: DATA PESSOA CONTA VENDEDOR
    // PEDIDO COMPRA QUAN VALOR PAGAM ENDEREÇO RASTREAMENTO).
    if (body.action === "bulk_import" && typeof body.text === "string") {
      const lines = body.text.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const created: any[] = [];
      const errors: { line: string; reason: string }[] = [];

      for (const line of lines) {
        const cols = line.split("\t").map((c: string) => c.trim());
        if (cols.length < 11) {
          errors.push({ line, reason: `Esperava 11 colunas, encontrou ${cols.length}` });
          continue;
        }
        const [data, pessoa, conta, vendedor, pedido, compra, quan, valor, pagam, endereco, rastreamento] = cols;
        if (!rastreamento || !pessoa) {
          errors.push({ line, reason: "Pessoa e código de rastreio são obrigatórios" });
          continue;
        }
        const order = await prisma.trackingOrder.create({
          data: {
            orderDate: parseBrDate(data),
            buyerPerson: pessoa,
            accountName: conta || null,
            sellerName: vendedor || null,
            externalOrderId: pedido || null,
            productName: compra || "—",
            quantity: quan ? parseInt(quan.replace(/\D/g, ""), 10) || null : null,
            unitValue: valor ? parseBrMoney(valor) : null,
            paymentMethod: pagam || null,
            shippingAddress: endereco || null,
            trackingCode: rastreamento.trim().toUpperCase(),
            statusCategory: null,
            createdById: (session!.user as any).id || null,
          },
        });
        created.push(order);
      }

      return NextResponse.json({ created: created.length, errors }, { status: 201 });
    }

    if (!body.trackingCode || !body.buyerPerson) {
      return NextResponse.json({ error: "Código de rastreio e pessoa são obrigatórios" }, { status: 400 });
    }

    const initial = await fetchTrackingStatus(body.trackingCode);

    const order = await prisma.trackingOrder.create({
      data: {
        orderDate: body.orderDate ? new Date(body.orderDate) : null,
        buyerPerson: body.buyerPerson,
        accountName: body.accountName || null,
        sellerName: body.sellerName || null,
        externalOrderId: body.externalOrderId || null,
        productName: body.productName || "—",
        quantity: body.quantity != null && body.quantity !== "" ? Number(body.quantity) : null,
        unitValue: body.unitValue != null && body.unitValue !== "" ? Number(body.unitValue) : null,
        paymentMethod: body.paymentMethod || null,
        shippingAddress: body.shippingAddress || null,
        trackingCode: body.trackingCode.trim().toUpperCase(),
        notes: body.notes || null,
        statusCategory: initial?.category ?? (body.statusCategory && STATUS_CATEGORIES.includes(body.statusCategory) ? body.statusCategory : null),
        statusRaw: initial?.raw || null,
        statusDetails: initial ? JSON.stringify(initial.details) : null,
        lastCheckedAt: initial ? new Date() : null,
        createdById: (session!.user as any).id || null,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const { denied } = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, action, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }

    const existing = await prisma.trackingOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
    }

    if (action === "refresh") {
      const result = await fetchTrackingStatus(existing.trackingCode);
      const updated = await prisma.trackingOrder.update({
        where: { id },
        data: {
          statusRaw: result?.raw || "indisponivel",
          statusCategory: result?.category ?? existing.statusCategory,
          statusDetails: result ? JSON.stringify(result.details) : existing.statusDetails,
          lastCheckedAt: new Date(),
        },
      });
      return NextResponse.json(updated);
    }

    if (action === "set_status") {
      if (!STATUS_CATEGORIES.includes(updates.statusCategory)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      const updated = await prisma.trackingOrder.update({
        where: { id },
        data: { statusCategory: updates.statusCategory },
      });
      return NextResponse.json(updated);
    }

    if (action === "archive") {
      const updated = await prisma.trackingOrder.update({ where: { id }, data: { archived: true } });
      return NextResponse.json(updated);
    }

    if (action === "unarchive") {
      const updated = await prisma.trackingOrder.update({ where: { id }, data: { archived: false } });
      return NextResponse.json(updated);
    }

    const data: Record<string, any> = {};
    if (updates.orderDate !== undefined) data.orderDate = updates.orderDate ? new Date(updates.orderDate) : null;
    if (updates.buyerPerson !== undefined) data.buyerPerson = updates.buyerPerson;
    if (updates.accountName !== undefined) data.accountName = updates.accountName;
    if (updates.sellerName !== undefined) data.sellerName = updates.sellerName;
    if (updates.externalOrderId !== undefined) data.externalOrderId = updates.externalOrderId;
    if (updates.productName !== undefined) data.productName = updates.productName;
    if (updates.quantity !== undefined) data.quantity = updates.quantity != null && updates.quantity !== "" ? Number(updates.quantity) : null;
    if (updates.unitValue !== undefined) data.unitValue = updates.unitValue != null && updates.unitValue !== "" ? Number(updates.unitValue) : null;
    if (updates.paymentMethod !== undefined) data.paymentMethod = updates.paymentMethod;
    if (updates.shippingAddress !== undefined) data.shippingAddress = updates.shippingAddress;
    if (updates.trackingCode !== undefined) data.trackingCode = String(updates.trackingCode).trim().toUpperCase();
    if (updates.notes !== undefined) data.notes = updates.notes;

    const updated = await prisma.trackingOrder.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const { denied } = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
  }

  try {
    await prisma.trackingOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  }
}
