'use client';
import { useState, useEffect } from 'react';
import './pedidos.css';

interface ItemPedido {
  nome: string;
  quantidade: number;
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
  itens: ItemPedido[];
  total: number;
  status: string;
  aprovadoPor: string;
  aprovadoEm: string;
  motivoRejeicao: string;
  perfil: string;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('todos');
  const [modalAprovacao, setModalAprovacao] = useState<{ pedido: Pedido; acao: 'aprovar' | 'rejeitar' } | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  useEffect(() => {
    fetchPedidos();
  }, []);

  async function fetchPedidos() {
    try {
      const res = await fetch('/api/pedidos');
      if (res.ok) {
        const data = await res.json();
        setPedidos(data.pedidos || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function aprovarPedido(id: string) {
    const res = await fetch('/api/pedidos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'aprovar', aprovadoPor: 'Gerente' }),
    });
    if (res.ok) {
      fetchPedidos();
      setModalAprovacao(null);
    }
  }

  async function rejeitarPedido(id: string) {
    const res = await fetch('/api/pedidos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'rejeitar', aprovadoPor: 'Gerente', motivoRejeicao }),
    });
    if (res.ok) {
      fetchPedidos();
      setModalAprovacao(null);
      setMotivoRejeicao('');
    }
  }

  async function finalizarPedido(id: string) {
    const res = await fetch('/api/pedidos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'finalizar' }),
    });
    if (res.ok) fetchPedidos();
  }

  async function excluirPedido(id: string) {
    if (!confirm('Tem certeza que deseja excluir este pedido?')) return;
    const res = await fetch(`/api/pedidos?id=${id}`, { method: 'DELETE' });
    if (res.ok) fetchPedidos();
  }

  const pedidosFiltrados = filtro === 'todos' 
    ? pedidos 
    : pedidos.filter(p => p.status === filtro);

  const pendentes = pedidos.filter(p => p.status === 'pendente_aprovacao').length;

  function formatCurrency(val: number): string {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function getStatusBadge(status: string) {
    const map: Record<string, { label: string; class: string }> = {
      rascunho: { label: 'Rascunho', class: 'status-rascunho' },
      pendente_aprovacao: { label: 'Pendente', class: 'status-pendente' },
      aprovado: { label: 'Aprovado', class: 'status-aprovado' },
      rejeitado: { label: 'Rejeitado', class: 'status-rejeitado' },
      finalizado: { label: 'Finalizado', class: 'status-finalizado' },
    };
    const s = map[status] || { label: status, class: '' };
    return <span className={`status-badge ${s.class}`}>{s.label}</span>;
  }

  return (
    <div className="pedidos-container">
      <div className="pedidos-header">
        <h1>Pedidos</h1>
        {pendentes > 0 && (
          <span className="pendentes-badge">{pendentes} pendente{pendentes > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Filtros */}
      <div className="pedidos-filtros">
        {[
          { id: 'todos', label: 'Todos' },
          { id: 'pendente_aprovacao', label: 'Pendentes' },
          { id: 'aprovado', label: 'Aprovados' },
          { id: 'rascunho', label: 'Rascunhos' },
          { id: 'rejeitado', label: 'Rejeitados' },
          { id: 'finalizado', label: 'Finalizados' },
        ].map(f => (
          <button
            key={f.id}
            className={`filtro-btn ${filtro === f.id ? 'active' : ''}`}
            onClick={() => setFiltro(f.id)}
          >
            {f.label}
            {f.id === 'pendente_aprovacao' && pendentes > 0 && (
              <span className="filtro-count">{pendentes}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de Pedidos */}
      {loading ? (
        <div className="pedidos-loading">Carregando...</div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="pedidos-vazio">Nenhum pedido encontrado.</div>
      ) : (
        <div className="pedidos-lista">
          {pedidosFiltrados.map(pedido => (
            <div key={pedido.id} className={`pedido-card ${pedido.status === 'pendente_aprovacao' ? 'destaque' : ''}`}>
              <div className="pedido-card-header">
                <div className="pedido-card-id">
                  <a href={`/dashboard/estoque/pedido?id=${pedido.id}`}>{pedido.id}</a>
                  {getStatusBadge(pedido.status)}
                </div>
                <span className="pedido-card-data">{formatDate(pedido.criadoEm)}</span>
              </div>

              <div className="pedido-card-body">
                <div className="pedido-card-info">
                  {pedido.cliente && <span className="info-cliente">👤 {pedido.cliente}</span>}
                  <span className="info-criador">Criado por: {pedido.criadoPor}</span>
                  <span className="info-itens">{pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}</span>
                </div>
                <div className="pedido-card-total">
                  <span className="total-label">Total</span>
                  <span className="total-valor">{formatCurrency(pedido.total)}</span>
                </div>
              </div>

              {/* Itens resumidos */}
              <div className="pedido-card-itens">
                {pedido.itens.slice(0, 3).map((item, idx) => (
                  <span key={idx} className="item-resumo">
                    {item.nome} ({item.quantidade}x)
                    {item.desconto > 0 && <span className="item-desconto">-{item.desconto.toFixed(0)}%</span>}
                  </span>
                ))}
                {pedido.itens.length > 3 && <span className="item-mais">+{pedido.itens.length - 3} mais</span>}
              </div>

              {/* Ações */}
              <div className="pedido-card-acoes">
                <a href={`/dashboard/estoque/pedido?id=${pedido.id}`} className="btn-ver">Ver</a>
                
                {pedido.status === 'pendente_aprovacao' && (
                  <>
                    <button className="btn-aprovar" onClick={() => setModalAprovacao({ pedido, acao: 'aprovar' })}>✅ Aprovar</button>
                    <button className="btn-rejeitar" onClick={() => setModalAprovacao({ pedido, acao: 'rejeitar' })}>❌ Rejeitar</button>
                  </>
                )}
                
                {pedido.status === 'aprovado' && (
                  <button className="btn-finalizar" onClick={() => finalizarPedido(pedido.id)}>🏁 Finalizar</button>
                )}
                
                {(pedido.status === 'rascunho' || pedido.status === 'rejeitado') && (
                  <button className="btn-excluir" onClick={() => excluirPedido(pedido.id)}>🗑 Excluir</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Aprovação/Rejeição */}
      {modalAprovacao && (
        <div className="modal-overlay" onClick={() => setModalAprovacao(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{modalAprovacao.acao === 'aprovar' ? '✅ Aprovar Pedido' : '❌ Rejeitar Pedido'}</h3>
            <p className="modal-pedido-id">{modalAprovacao.pedido.id}</p>
            <p className="modal-info">
              Cliente: <strong>{modalAprovacao.pedido.cliente || '—'}</strong> | 
              Total: <strong>{formatCurrency(modalAprovacao.pedido.total)}</strong>
            </p>

            {modalAprovacao.acao === 'rejeitar' && (
              <div className="modal-motivo">
                <label>Motivo da rejeição:</label>
                <textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Descreva o motivo..."
                  rows={3}
                />
              </div>
            )}

            <div className="modal-acoes">
              {modalAprovacao.acao === 'aprovar' ? (
                <button className="btn-confirmar-aprovar" onClick={() => aprovarPedido(modalAprovacao.pedido.id)}>
                  Confirmar Aprovação
                </button>
              ) : (
                <button className="btn-confirmar-rejeitar" onClick={() => rejeitarPedido(modalAprovacao.pedido.id)}>
                  Confirmar Rejeição
                </button>
              )}
              <button className="btn-modal-cancelar" onClick={() => setModalAprovacao(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
