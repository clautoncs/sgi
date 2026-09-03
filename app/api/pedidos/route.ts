import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Sem isto a rota fica aberta na internet: o middleware protege as paginas,
// nao as APIs.
async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  return null;
}

const PEDIDOS_PATH = '/app/data/pedidos.json';

interface ItemPedido {
  produtoId: string;
  nome: string;
  descricao: string;
  categoria: string;
  quantidade: number;
  valorOriginal: number;
  valorFinal: number;
  desconto: number; // percentual
}

interface Pedido {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string;
  criadoPorEmail: string;
  cliente: string;
  telefone: string;
  observacoes: string;
  itens: ItemPedido[];
  subtotal: number;
  descontoGeral: number;
  total: number;
  status: 'rascunho' | 'pendente_aprovacao' | 'aprovado' | 'rejeitado' | 'finalizado';
  aprovadoPor: string;
  aprovadoEm: string;
  motivoRejeicao: string;
  perfil: string; // prateleira, revenda, vendedor
}

function loadPedidos(): Pedido[] {
  try {
    if (existsSync(PEDIDOS_PATH)) {
      const data = JSON.parse(readFileSync(PEDIDOS_PATH, "utf-8")); return Array.isArray(data) ? data : (data.pedidos || []);
    }
  } catch (e) {}
  return [];
}

function savePedidos(pedidos: Pedido[]) {
  writeFileSync(PEDIDOS_PATH, JSON.stringify(pedidos, null, 2));
}

function generateId(): string {
  const now = new Date();
  const prefix = `PED-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

export async function GET(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const status = searchParams.get('status');
  
  const pedidos = loadPedidos();
  
  if (id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }
    return NextResponse.json(pedido);
  }
  
  let filtered = pedidos;
  if (status) {
    filtered = filtered.filter(p => p.status === status);
  }
  
  // Ordenar por data de criação (mais recente primeiro)
  filtered.sort((a, b) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime());
  
  return NextResponse.json({ pedidos: filtered, total: filtered.length });
}

export async function POST(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();
    const pedidos = loadPedidos();
    
    const novoPedido: Pedido = {
      id: generateId(),
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
      criadoPor: body.criadoPor || 'Sistema',
      criadoPorEmail: body.criadoPorEmail || '',
      cliente: body.cliente || '',
      telefone: body.telefone || '',
      observacoes: body.observacoes || '',
      itens: body.itens || [],
      subtotal: body.subtotal || 0,
      descontoGeral: body.descontoGeral || 0,
      total: body.total || 0,
      status: body.enviarAprovacao ? 'pendente_aprovacao' : 'rascunho',
      aprovadoPor: '',
      aprovadoEm: '',
      motivoRejeicao: '',
      perfil: body.perfil || 'prateleira',
    };
    
    pedidos.push(novoPedido);
    savePedidos(pedidos);
    
    return NextResponse.json(novoPedido, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const body = await request.json();
    const { id, action, ...updates } = body;
    
    if (!id) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
    }
    
    const pedidos = loadPedidos();
    const idx = pedidos.findIndex(p => p.id === id);
    
    if (idx === -1) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }
    
    // Ações especiais
    if (action === 'aprovar') {
      pedidos[idx].status = 'aprovado';
      pedidos[idx].aprovadoPor = updates.aprovadoPor || 'Gerente';
      pedidos[idx].aprovadoEm = new Date().toISOString();
      pedidos[idx].atualizadoEm = new Date().toISOString();
    } else if (action === 'rejeitar') {
      pedidos[idx].status = 'rejeitado';
      pedidos[idx].aprovadoPor = updates.aprovadoPor || 'Gerente';
      pedidos[idx].aprovadoEm = new Date().toISOString();
      pedidos[idx].motivoRejeicao = updates.motivoRejeicao || '';
      pedidos[idx].atualizadoEm = new Date().toISOString();
    } else if (action === 'enviar_aprovacao') {
      pedidos[idx].status = 'pendente_aprovacao';
      pedidos[idx].atualizadoEm = new Date().toISOString();
    } else if (action === 'finalizar') {
      pedidos[idx].status = 'finalizado';
      pedidos[idx].atualizadoEm = new Date().toISOString();
    } else {
      // Atualização geral (edição do pedido)
      if (updates.itens) pedidos[idx].itens = updates.itens;
      if (updates.cliente !== undefined) pedidos[idx].cliente = updates.cliente;
      if (updates.telefone !== undefined) pedidos[idx].telefone = updates.telefone;
      if (updates.observacoes !== undefined) pedidos[idx].observacoes = updates.observacoes;
      if (updates.total !== undefined) pedidos[idx].total = updates.total;
      if (updates.subtotal !== undefined) pedidos[idx].subtotal = updates.subtotal;
      if (updates.descontoGeral !== undefined) pedidos[idx].descontoGeral = updates.descontoGeral;
      pedidos[idx].atualizadoEm = new Date().toISOString();
    }
    
    savePedidos(pedidos);
    return NextResponse.json(pedidos[idx]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 });
  }
  
  const pedidos = loadPedidos();
  const filtered = pedidos.filter(p => p.id !== id);
  
  if (filtered.length === pedidos.length) {
    return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
  }
  
  savePedidos(filtered);
  return NextResponse.json({ success: true });
}
