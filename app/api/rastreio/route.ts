import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { fetchTrackingStatus, refreshOrder } from "@/lib/rastreio";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { denied: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), session: null };
  }
  return { denied: null, session };
}

const STATUS_CATEGORIES = ["postado", "em_transito", "barrado", "entregue"];

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
    include: { createdBy: { select: { name: true } }, product: { select: { id: true, name: true } } },
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
        productId: body.productId || null,
        realValue: body.realValue != null && body.realValue !== "" ? Number(body.realValue) : null,
        realQuantity: body.realQuantity != null && body.realQuantity !== "" ? Number(body.realQuantity) : null,
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
      const r = await refreshOrder(prisma, existing);
      if (!r) {
        return NextResponse.json({ error: "SEU_RASTREIO_API_KEY não configurada no servidor" }, { status: 503 });
      }
      return NextResponse.json({ ...r.updated, refreshFailed: r.failed, refreshRaw: r.raw });
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
    if (updates.productId !== undefined) data.productId = updates.productId || null;
    if (updates.realValue !== undefined) data.realValue = updates.realValue != null && updates.realValue !== "" ? Number(updates.realValue) : null;
    if (updates.realQuantity !== undefined) data.realQuantity = updates.realQuantity != null && updates.realQuantity !== "" ? Number(updates.realQuantity) : null;
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
