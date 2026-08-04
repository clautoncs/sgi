import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET - Buscar metas do mês
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    
    const metas = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: `meta_${month}_`,
        },
      },
    });
    
    // Também buscar meta geral do mês
    const metaGeral = await prisma.systemSetting.findFirst({
      where: { key: `meta_geral_${month}` },
    });
    
    const metasFormatadas: Record<string, number> = {};
    metas.forEach(m => {
      const vendedor = m.key.replace(`meta_${month}_`, '');
      metasFormatadas[vendedor] = parseFloat(m.value);
    });
    
    return NextResponse.json({
      month,
      metaGeral: metaGeral ? parseFloat(metaGeral.value) : 0,
      metasPorVendedor: metasFormatadas,
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
    
    // Salvar meta geral
    if (metaGeral !== undefined) {
      await prisma.systemSetting.upsert({
        where: { key: `meta_geral_${month}` },
        update: { value: metaGeral.toString() },
        create: { key: `meta_geral_${month}`, value: metaGeral.toString(), label: `Meta Geral ${month}` },
      });
    }
    
    // Salvar metas por vendedor
    if (metasPorVendedor && typeof metasPorVendedor === 'object') {
      for (const [vendedor, valor] of Object.entries(metasPorVendedor)) {
        const key = `meta_${month}_${vendedor}`;
        await prisma.systemSetting.upsert({
          where: { key },
          update: { value: (valor as number).toString() },
          create: { key, value: (valor as number).toString(), label: `Meta ${vendedor} ${month}` },
        });
      }
    }
    
    return NextResponse.json({ success: true, message: 'Metas salvas com sucesso' });
    
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao salvar metas', details: error.message },
      { status: 500 }
    );
  }
}
