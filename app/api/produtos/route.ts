import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return null;
}

// Lista produtos; com ?rollup=true agrega os números dos rastreios
// vinculados (valor real, qtd real, custo unitário) — o estoque em si não
// entra em cálculo nenhum, só a identidade do produto.
export async function GET(request: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("inactive") === "true";
  const rollup = searchParams.get("rollup") === "true";

  const products = await prisma.product.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: "asc" },
    include: rollup
      ? {
          trackingOrders: {
            where: { archived: false },
            select: { realValue: true, realQuantity: true, quantity: true, statusCategory: true },
          },
        }
      : undefined,
  });

  if (!rollup) {
    return NextResponse.json({ products });
  }

  const withRollup = products.map((p: any) => {
    let valorReal = 0, qtdReal = 0, rastreios = 0;
    const porStatus: Record<string, number> = { postado: 0, em_transito: 0, barrado: 0, entregue: 0, sem_status: 0 };
    for (const t of p.trackingOrders) {
      rastreios++;
      valorReal += t.realValue ?? 0;
      qtdReal += t.realQuantity ?? t.quantity ?? 0;
      const cat = t.statusCategory && porStatus[t.statusCategory] !== undefined ? t.statusCategory : "sem_status";
      porStatus[cat]++;
    }
    const { trackingOrders, ...rest } = p;
    return {
      ...rest,
      rollup: {
        rastreios,
        valorReal,
        qtdReal,
        custoUnitReal: qtdReal > 0 ? valorReal / qtdReal : null,
        porStatus,
      },
    };
  });

  return NextResponse.json({ products: withRollup });
}

export async function POST(request: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Nome do produto é obrigatório" }, { status: 400 });
    }
    const product = await prisma.product.create({
      data: {
        name: body.name.trim(),
        sku: body.sku?.trim() || null,
        category: body.category?.trim() || null,
        notes: body.notes?.trim() || null,
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    }
    const data: Record<string, any> = {};
    if (updates.name !== undefined) data.name = String(updates.name).trim();
    if (updates.sku !== undefined) data.sku = updates.sku?.trim() || null;
    if (updates.category !== undefined) data.category = updates.category?.trim() || null;
    if (updates.notes !== undefined) data.notes = updates.notes?.trim() || null;
    if (updates.isActive !== undefined) data.isActive = Boolean(updates.isActive);

    const product = await prisma.product.update({ where: { id }, data });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
  }

  const linked = await prisma.trackingOrder.count({ where: { productId: id } });
  if (linked > 0) {
    return NextResponse.json(
      { error: `Produto vinculado a ${linked} rastreio(s) — desative em vez de excluir` },
      { status: 400 }
    );
  }

  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
  }
}
