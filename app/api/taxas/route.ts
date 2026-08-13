import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const TAXAS_FILE = "/app/taxas.json";

interface Canal {
  id: string;
  label: string;
  percentual: number;
  descricao: string;
}

interface TaxasDB {
  imposto: {
    label: string;
    percentual: number;
    descricao: string;
  };
  canais: Canal[];
}

async function readTaxas(): Promise<TaxasDB> {
  try {
    const data = await fs.readFile(TAXAS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      imposto: { label: "Imposto (NF)", percentual: 12.0, descricao: "Percentual de imposto sobre o total" },
      canais: [
        { id: "vendedor", label: "Vendedor (Loja)", percentual: 0, descricao: "Venda direta" },
        { id: "shopee", label: "Shopee", percentual: 20, descricao: "Comissão Shopee" },
        { id: "licitador", label: "Licitador", percentual: 10, descricao: "Comissão licitação" },
      ],
    };
  }
}

async function writeTaxas(db: TaxasDB): Promise<void> {
  await fs.writeFile(TAXAS_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export async function GET() {
  try {
    const taxas = await readTaxas();
    return NextResponse.json(taxas);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, ...data } = body;
    const db = await readTaxas();

    if (action === "update_imposto") {
      db.imposto.percentual = data.percentual;
      if (data.label) db.imposto.label = data.label;
      await writeTaxas(db);
      return NextResponse.json({ success: true });
    }

    if (action === "update_canal") {
      const canal = db.canais.find(c => c.id === data.id);
      if (!canal) return NextResponse.json({ error: "Canal não encontrado" }, { status: 404 });
      if (data.percentual !== undefined) canal.percentual = data.percentual;
      if (data.label) canal.label = data.label;
      if (data.descricao) canal.descricao = data.descricao;
      await writeTaxas(db);
      return NextResponse.json({ success: true });
    }

    if (action === "add_canal") {
      const exists = db.canais.find(c => c.id === data.id);
      if (exists) return NextResponse.json({ error: "Canal já existe" }, { status: 400 });
      db.canais.push({ id: data.id, label: data.label, percentual: data.percentual || 0, descricao: data.descricao || "" });
      await writeTaxas(db);
      return NextResponse.json({ success: true });
    }

    if (action === "remove_canal") {
      db.canais = db.canais.filter(c => c.id !== data.id);
      await writeTaxas(db);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
