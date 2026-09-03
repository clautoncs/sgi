import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getSetting, saveSetting } from '@/lib/settings';

// Sem isto a rota fica aberta na internet: o middleware protege as paginas,
// nao as APIs.
async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  return null;
}

async function nomeDoUsuario(): Promise<string> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  return u?.name || u?.email || 'Desconhecido';
}

async function readMetas(): Promise<Record<string, any>> {
  return getSetting<Record<string, any>>('metas', {});
}

async function writeMetas(metas: Record<string, any>): Promise<void> {
  await saveSetting('metas', metas, await nomeDoUsuario());
}

// GET - Buscar metas do mês
export async function GET(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

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
  const denied = await requireSession();
  if (denied) return denied;

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
