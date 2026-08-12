'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import './pedido.css';

interface ItemPedido {
  produtoId: string;
  nome: string;
  descricao: string;
  categoria: string;
  quantidade: number;
  valorOriginal: number;
  valorFinal: number;
  desconto: number;
}

interface Pedido {
  id: string;
  criadoEm: string;
  atualizadoEm: string;
  criadoPor: string;
  cliente: string;
  telefone: string;
  observacoes: string;
  itens: ItemPedido[];
  subtotal: number;
  descontoGeral: number;
  total: number;
  status: string;
  aprovadoPor: string;
  aprovadoEm: string;
  motivoRejeicao: string;
  perfil: string;
}

function PedidoContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (id) fetchPedido();
  }, [id]);

  async function fetchPedido() {
    try {
      const res = await fetch(`/api/pedidos?id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setPedido(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function salvarEdicao() {
    if (!pedido) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/pedidos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: pedido.id,
          itens: pedido.itens,
          cliente: pedido.cliente,
          telefone: pedido.telefone,
          observacoes: pedido.observacoes,
          total: pedido.total,
          subtotal: pedido.subtotal,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPedido(updated);
        setEditando(false);
      }
    } catch (err) {
      alert('Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function enviarParaAprovacao() {
    if (!pedido) return;
    const res = await fetch('/api/pedidos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pedido.id, action: 'enviar_aprovacao' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setPedido(updated);
    }
  }

  function atualizarItem(idx: number, campo: string, valor: any) {
    if (!pedido) return;
    const novosItens = [...pedido.itens];
    (novosItens[idx] as any)[campo] = valor;
    
    // Recalcular total
    const novoTotal = novosItens.reduce((acc, item) => acc + (item.valorFinal * item.quantidade), 0);
    setPedido({ ...pedido, itens: novosItens, total: novoTotal });
  }

  function formatCurrency(val: number): string {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; class: string }> = {
      rascunho: { label: 'Rascunho', class: 'status-rascunho' },
      pendente_aprovacao: { label: 'Pendente Aprovação', class: 'status-pendente' },
      aprovado: { label: 'Aprovado', class: 'status-aprovado' },
      rejeitado: { label: 'Rejeitado', class: 'status-rejeitado' },
      finalizado: { label: 'Finalizado', class: 'status-finalizado' },
    };
    const s = map[status] || { label: status, class: '' };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  }

  function gerarWhatsApp() {
    if (!pedido) return;
    let texto = `*PROPOSTA COMERCIAL - PCBH Informática*\n`;
    texto += `Pedido: ${pedido.id}\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (pedido.cliente) texto += `*Cliente:* ${pedido.cliente}\n`;
    texto += `\n`;
    pedido.itens.forEach((item, idx) => {
      texto += `*${idx + 1}. ${item.nome}*\n`;
      if (item.descricao) texto += `   ${item.descricao}\n`;
      texto += `   Qtd: ${item.quantidade} | Valor: ${formatCurrency(item.valorFinal)}\n`;
      if (item.desconto > 0) texto += `   _Desconto: ${item.desconto.toFixed(1)}%_\n`;
      texto += `   *Subtotal: ${formatCurrency(item.valorFinal * item.quantidade)}*\n\n`;
    });
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `*TOTAL: ${formatCurrency(pedido.total)}*\n`;
    const url = `https://wa.me/${pedido.telefone ? pedido.telefone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  if (loading) return <div className="pedido-loading">Carregando pedido...</div>;
  if (!pedido) return <div className="pedido-erro">Pedido não encontrado.</div>;

  return (
    <div className="pedido-container">
      {/* Header */}
      <div className="pedido-header">
        <div className="pedido-header-left">
          <h1>Pedido {pedido.id}</h1>
          {getStatusBadge(pedido.status)}
        </div>
        <div className="pedido-header-right">
          <span className="pedido-data">Criado em {formatDate(pedido.criadoEm)}</span>
          {pedido.atualizadoEm !== pedido.criadoEm && (
            <span className="pedido-data">Atualizado em {formatDate(pedido.atualizadoEm)}</span>
          )}
        </div>
      </div>

      {/* Info do Cliente */}
      <div className="pedido-cliente-info">
        <div className="pedido-campo">
          <label>Cliente:</label>
          {editando ? (
            <input type="text" value={pedido.cliente} onChange={(e) => setPedido({ ...pedido, cliente: e.target.value })} />
          ) : (
            <span>{pedido.cliente || '—'}</span>
          )}
        </div>
        <div className="pedido-campo">
          <label>Telefone:</label>
          {editando ? (
            <input type="text" value={pedido.telefone} onChange={(e) => setPedido({ ...pedido, telefone: e.target.value })} />
          ) : (
            <span>{pedido.telefone || '—'}</span>
          )}
        </div>
        <div className="pedido-campo">
          <label>Criado por:</label>
          <span>{pedido.criadoPor}</span>
        </div>
        <div className="pedido-campo">
          <label>Perfil:</label>
          <span className="perfil-tag">{pedido.perfil}</span>
        </div>
      </div>

      {/* Observações */}
      {(pedido.observacoes || editando) && (
        <div className="pedido-obs">
          <label>Observações:</label>
          {editando ? (
            <textarea value={pedido.observacoes} onChange={(e) => setPedido({ ...pedido, observacoes: e.target.value })} rows={3} />
          ) : (
            <p>{pedido.observacoes}</p>
          )}
        </div>
      )}

      {/* Tabela de Itens */}
      <div className="pedido-itens">
        <h2>Itens do Pedido</h2>
        <table className="pedido-tabela">
          <thead>
            <tr>
              <th>#</th>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Qtd</th>
              <th>Valor Original</th>
              <th>Desconto</th>
              <th>Valor Final</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {pedido.itens.map((item, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <strong>{item.nome}</strong>
                  {item.descricao && <><br /><small>{item.descricao}</small></>}
                </td>
                <td><span className={`cat-tag cat-${item.categoria.toLowerCase()}`}>{item.categoria}</span></td>
                <td>
                  {editando ? (
                    <input type="number" min="1" value={item.quantidade} onChange={(e) => atualizarItem(idx, 'quantidade', parseInt(e.target.value) || 1)} className="input-qtd" />
                  ) : (
                    item.quantidade
                  )}
                </td>
                <td>{formatCurrency(item.valorOriginal)}</td>
                <td>
                  {editando ? (
                    <input type="number" min="0" max="100" step="0.1" value={item.desconto} onChange={(e) => {
                      const desc = parseFloat(e.target.value) || 0;
                      atualizarItem(idx, 'desconto', desc);
                      atualizarItem(idx, 'valorFinal', item.valorOriginal * (1 - desc / 100));
                    }} className="input-desc" />
                  ) : (
                    item.desconto > 0 ? `${item.desconto.toFixed(1)}%` : '—'
                  )}
                </td>
                <td>
                  {editando ? (
                    <input type="number" min="0" step="0.01" value={item.valorFinal} onChange={(e) => atualizarItem(idx, 'valorFinal', parseFloat(e.target.value) || 0)} className="input-valor" />
                  ) : (
                    <strong>{formatCurrency(item.valorFinal)}</strong>
                  )}
                </td>
                <td><strong>{formatCurrency(item.valorFinal * item.quantidade)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}><strong>TOTAL</strong></td>
              <td><strong className="total-valor">{formatCurrency(pedido.total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Aprovação info */}
      {pedido.status === 'aprovado' && (
        <div className="pedido-aprovacao-info aprovado">
          <span>✅ Aprovado por <strong>{pedido.aprovadoPor}</strong> em {formatDate(pedido.aprovadoEm)}</span>
        </div>
      )}
      {pedido.status === 'rejeitado' && (
        <div className="pedido-aprovacao-info rejeitado">
          <span>❌ Rejeitado por <strong>{pedido.aprovadoPor}</strong> em {formatDate(pedido.aprovadoEm)}</span>
          {pedido.motivoRejeicao && <p>Motivo: {pedido.motivoRejeicao}</p>}
        </div>
      )}

      {/* Ações */}
      <div className="pedido-acoes">
        {(pedido.status === 'rascunho' || pedido.status === 'rejeitado') && !editando && (
          <>
            <button className="btn-editar" onClick={() => setEditando(true)}>✏️ Editar Pedido</button>
            <button className="btn-enviar" onClick={enviarParaAprovacao}>📤 Enviar p/ Aprovação</button>
          </>
        )}
        {editando && (
          <>
            <button className="btn-salvar" onClick={salvarEdicao} disabled={salvando}>
              {salvando ? '⏳ Salvando...' : '💾 Salvar Alterações'}
            </button>
            <button className="btn-cancelar" onClick={() => { setEditando(false); fetchPedido(); }}>Cancelar</button>
          </>
        )}
        <button className="btn-whatsapp-pedido" onClick={gerarWhatsApp}>📱 Enviar WhatsApp</button>
        <button className="btn-copiar" onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Link copiado!'); }}>🔗 Copiar Link</button>
      </div>
    </div>
  );
}

export default function PedidoPage() {
  return (
    <Suspense fallback={<div className="pedido-loading">Carregando...</div>}>
      <PedidoContent />
    </Suspense>
  );
}
