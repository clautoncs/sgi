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

// Consulta o status de um código de rastreio na API da Site Rastreio.
// Endpoint/formato ainda não confirmados com a chave real — se a chamada
// falhar (config ausente, 4xx/5xx, formato inesperado), devolve status
// "indisponivel" em vez de derrubar a requisição.
async function fetchTrackingStatus(code: string): Promise<{ status: string; details: any } | null> {
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
      return { status: "indisponivel", details: { error: `HTTP ${res.status}` } };
    }
    const data = await res.json();
    return { status: data.status || data.situacao || "desconhecido", details: data };
  } catch (e: any) {
    return { status: "indisponivel", details: { error: e.message } };
  }
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
    if (!body.trackingCode || !body.supplier) {
      return NextResponse.json({ error: "Código de rastreio e fornecedor são obrigatórios" }, { status: 400 });
    }

    const initial = await fetchTrackingStatus(body.trackingCode);

    const order = await prisma.trackingOrder.create({
      data: {
        trackingCode: body.trackingCode.trim().toUpperCase(),
        supplier: body.supplier,
        productName: body.productName || null,
        amountPaid: body.amountPaid != null ? Number(body.amountPaid) : null,
        expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
        notes: body.notes || null,
        status: initial?.status || "aguardando_consulta",
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
          status: result?.status || "indisponivel",
          statusDetails: result ? JSON.stringify(result.details) : existing.statusDetails,
          lastCheckedAt: new Date(),
        },
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
    if (updates.trackingCode !== undefined) data.trackingCode = String(updates.trackingCode).trim().toUpperCase();
    if (updates.supplier !== undefined) data.supplier = updates.supplier;
    if (updates.productName !== undefined) data.productName = updates.productName;
    if (updates.amountPaid !== undefined) data.amountPaid = updates.amountPaid != null ? Number(updates.amountPaid) : null;
    if (updates.expectedDate !== undefined) data.expectedDate = updates.expectedDate ? new Date(updates.expectedDate) : null;
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
