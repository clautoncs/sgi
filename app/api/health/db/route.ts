import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Não guardar em cache: sempre testa a conexão de verdade.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Consulta mínima só para provar que o banco respondeu.
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ db: 'ok' });
  } catch (erro) {
    return NextResponse.json(
      { db: 'erro', detalhe: String(erro) },
      { status: 500 },
    );
  }
}
