import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return { denied: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), userName: "" };
  }
  const u = session.user as any;
  return { denied: null, userName: u?.name || u?.email || "Usuário" };
}

function money(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function GET(request: NextRequest) {
  const { denied } = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const includeInactive = searchParams.get("inactive") === "true";

  const products = await prisma.costProduct.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: { seq: "asc" } },
      changes: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });

  const withTotals = products.map((p) => ({
    ...p,
    totalCost: p.items.reduce((s, i) => s + i.quantity * i.unitValue, 0),
  }));

  return NextResponse.json({ products: withTotals });
}

export async function POST(request: NextRequest) {
  const { denied, userName } = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();

    // Cria um item dentro de um produto (numeração incremental automática)
    if (body.action === "add_item") {
      const { productId, description, quantity, unitValue } = body;
      if (!productId || !description?.trim()) {
        return NextResponse.json({ error: "Produto e descrição são obrigatórios" }, { status: 400 });
      }
      const last = await prisma.costProductItem.findFirst({
        where: { productId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const qty = Number(quantity) || 1;
      const unit = Number(unitValue) || 0;
      const item = await prisma.costProductItem.create({
        data: {
          productId,
          seq: (last?.seq ?? 0) + 1,
          description: description.trim(),
          quantity: qty,
          unitValue: unit,
        },
      });
      await prisma.costProductChange.create({
        data: {
          productId,
          action: "adicionou_item",
          details: `Item ${item.seq}: ${item.description} — ${qty} × ${money(unit)} = ${money(qty * unit)}`,
          userName,
        },
      });
      return NextResponse.json(item, { status: 201 });
    }

    // Cria o produto (orçamento)
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Nome do produto é obrigatório" }, { status: 400 });
    }
    const product = await prisma.costProduct.create({
      data: { name: body.name.trim(), notes: body.notes?.trim() || null },
    });
    await prisma.costProductChange.create({
      data: { productId: product.id, action: "criou_produto", details: `Produto "${product.name}" criado`, userName },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  const { denied, userName } = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();

    // Edita um item existente
    if (body.action === "update_item") {
      const { itemId, description, quantity, unitValue } = body;
      const existing = await prisma.costProductItem.findUnique({ where: { id: itemId } });
      if (!existing) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });

      const qty = quantity != null ? Number(quantity) : existing.quantity;
      const unit = unitValue != null ? Number(unitValue) : existing.unitValue;
      const desc = description?.trim() || existing.description;

      const item = await prisma.costProductItem.update({
        where: { id: itemId },
        data: { description: desc, quantity: qty, unitValue: unit },
      });

      const mudancas: string[] = [];
      if (desc !== existing.description) mudancas.push(`descrição "${existing.description}" → "${desc}"`);
      if (qty !== existing.quantity) mudancas.push(`quantidade ${existing.quantity} → ${qty}`);
      if (unit !== existing.unitValue) mudancas.push(`valor unitário ${money(existing.unitValue)} → ${money(unit)}`);

      if (mudancas.length > 0) {
        await prisma.costProductChange.create({
          data: {
            productId: existing.productId,
            action: "editou_item",
            details: `Item ${existing.seq}: ${mudancas.join("; ")}`,
            userName,
          },
        });
      }
      return NextResponse.json(item);
    }

    // Edita o produto
    const { id, name, notes, isActive } = body;
    if (!id) return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    const existing = await prisma.costProduct.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

    const data: Record<string, any> = {};
    const mudancas: string[] = [];
    if (name !== undefined && name.trim() !== existing.name) {
      data.name = name.trim();
      mudancas.push(`nome "${existing.name}" → "${name.trim()}"`);
    }
    if (notes !== undefined && (notes?.trim() || null) !== existing.notes) {
      data.notes = notes?.trim() || null;
      mudancas.push("notas alteradas");
    }
    if (isActive !== undefined && Boolean(isActive) !== existing.isActive) {
      data.isActive = Boolean(isActive);
      mudancas.push(isActive ? "reativado" : "desativado");
    }

    const product = await prisma.costProduct.update({ where: { id }, data });
    if (mudancas.length > 0) {
      await prisma.costProductChange.create({
        data: { productId: id, action: "editou_produto", details: mudancas.join("; "), userName },
      });
    }
    return NextResponse.json(product);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const { denied, userName } = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("itemId");
  const id = searchParams.get("id");

  try {
    if (itemId) {
      const item = await prisma.costProductItem.findUnique({ where: { id: itemId } });
      if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
      await prisma.costProductItem.delete({ where: { id: itemId } });
      await prisma.costProductChange.create({
        data: {
          productId: item.productId,
          action: "removeu_item",
          details: `Item ${item.seq} removido: ${item.description} (${item.quantity} × ${money(item.unitValue)})`,
          userName,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (!id) return NextResponse.json({ error: "ID é obrigatório" }, { status: 400 });
    await prisma.costProduct.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Registro não encontrado" }, { status: 404 });
  }
}
