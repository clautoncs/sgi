import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const METAS_FILE = path.join(process.cwd(), 'metas.json');

async function readMetas(): Promise<Record<string, any>> {
  try {
    const data = await fs.readFile(METAS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeMetas(metas: Record<string, any>): Promise<void> {
  await fs.writeFile(METAS_FILE, JSON.stringify(metas, null, 2), 'utf-8');
}

// GET - Buscar metas do mês
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const allMetas = await readMetas();
    const monthData = allMetas[month] || {};

    return NextResponse.json({
      month,
      metaGeral: monthData.metaGeral || 0,
      metasPorVendedor: monthData.metasPorVendedor || {},
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao buscar metas', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Salvar/atualizar metas
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { month, metaGeral, metasPorVendedor } = body;

    if (!month) {
      return NextResponse.json({ error: 'Mês é obrigatório' }, { status: 400 });
    }

    const allMetas = await readMetas();
    
    if (!allMetas[month]) {
      allMetas[month] = {};
    }

    if (metaGeral !== undefined) {
      allMetas[month].metaGeral = metaGeral;
    }

    if (metasPorVendedor && typeof metasPorVendedor === 'object') {
      allMetas[month].metasPorVendedor = {
        ...(allMetas[month].metasPorVendedor || {}),
        ...metasPorVendedor,
      };
    }

    await writeMetas(allMetas);

    return NextResponse.json({ success: true, message: 'Metas salvas com sucesso' });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao salvar metas', details: error.message },
      { status: 500 }
    );
  }
}
