"use client";
import { useState, useEffect } from "react";
import "./rastreio.css";

interface TrackingOrder {
  id: string;
  trackingCode: string;
  supplier: string;
  productName: string | null;
  amountPaid: number | null;
  expectedDate: string | null;
  notes: string | null;
  status: string | null;
  lastCheckedAt: string | null;
  archived: boolean;
  createdAt: string;
  createdBy: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  aguardando_consulta: "Aguardando consulta",
  indisponivel: "Status indisponível",
  entregue: "Entregue",
  em_transito: "Em trânsito",
  em_transporte: "Em transporte",
  desconhecido: "Desconhecido",
  postado: "Postado",
};

function statusLabel(status: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status] || status;
}

function statusClass(status: string | null): string {
  return `status-${status || "desconhecido"}`;
}

const emptyForm = {
  trackingCode: "",
  supplier: "AliExpress",
  productName: "",
  amountPaid: "",
  expectedDate: "",
  notes: "",
};

export default function RastreioPage() {
  const [orders, setOrders] = useState<TrackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, [showArchived]);

  async function fetchOrders() {
    setLoading(true);
    try {
      const res = await fetch(`/api/rastreio?archived=${showArchived}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function openNovo() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEditar(o: TrackingOrder) {
    setEditingId(o.id);
    setForm({
      trackingCode: o.trackingCode,
      supplier: o.supplier,
      productName: o.productName || "",
      amountPaid: o.amountPaid != null ? String(o.amountPaid) : "",
      expectedDate: o.expectedDate ? o.expectedDate.slice(0, 10) : "",
      notes: o.notes || "",
    });
    setError("");
    setModalOpen(true);
  }

  async function salvar() {
    if (!form.trackingCode.trim() || !form.supplier.trim()) {
      setError("Código de rastreio e fornecedor são obrigatórios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        trackingCode: form.trackingCode,
        supplier: form.supplier,
        productName: form.productName || null,
        amountPaid: form.amountPaid ? Number(form.amountPaid.replace(",", ".")) : null,
        expectedDate: form.expectedDate || null,
        notes: form.notes || null,
      };
      const res = await fetch("/api/rastreio", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao salvar.");
        return;
      }
      setModalOpen(false);
      fetchOrders();
    } finally {
      setSaving(false);
    }
  }

  async function refreshStatus(id: string) {
    setRefreshingId(id);
    try {
      const res = await fetch("/api/rastreio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "refresh" }),
      });
      if (res.ok) fetchOrders();
    } finally {
      setRefreshingId(null);
    }
  }

  async function arquivar(id: string, archived: boolean) {
    const res = await fetch("/api/rastreio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: archived ? "unarchive" : "archive" }),
    });
    if (res.ok) fetchOrders();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este registro de rastreio?")) return;
    const res = await fetch(`/api/rastreio?id=${id}`, { method: "DELETE" });
    if (res.ok) fetchOrders();
  }

  function formatCurrency(v: number | null): string {
    if (v == null) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("pt-BR");
  }

  return (
    <div className="rastreio-container">
      <div className="rastreio-header">
        <h1>Rastreio de Pedidos</h1>
        <button className="rastreio-btn-novo" onClick={openNovo}>+ Novo Rastreio</button>
      </div>

      <div className="rastreio-filtros">
        <button className={`rastreio-filtro-btn ${!showArchived ? "active" : ""}`} onClick={() => setShowArchived(false)}>
          Ativos
        </button>
        <button className={`rastreio-filtro-btn ${showArchived ? "active" : ""}`} onClick={() => setShowArchived(true)}>
          Todos (com arquivados)
        </button>
      </div>

      {loading ? (
        <div className="rastreio-loading">Carregando...</div>
      ) : orders.length === 0 ? (
        <div className="rastreio-vazio">Nenhum pedido cadastrado ainda.</div>
      ) : (
        <div className="rastreio-lista">
          {orders.map((o) => (
            <div key={o.id} className="rastreio-card">
              <div className="rastreio-card-main">
                <span className="rastreio-card-codigo">{o.trackingCode}</span>
                <div className="rastreio-card-info">
                  <span>📦 {o.supplier}</span>
                  {o.productName && <span>🛒 {o.productName}</span>}
                  {o.amountPaid != null && <span>💰 {formatCurrency(o.amountPaid)}</span>}
                  {o.expectedDate && <span>📅 Previsão: {formatDate(o.expectedDate)}</span>}
                  {o.lastCheckedAt && <span>🕐 Consultado em {formatDate(o.lastCheckedAt)}</span>}
                  {o.createdBy?.name && <span>Cadastrado por: {o.createdBy.name}</span>}
                </div>
                {o.notes && <span className="rastreio-card-notas">{o.notes}</span>}
              </div>
              <div className="rastreio-card-acoes">
                <span className={`rastreio-status-badge ${statusClass(o.status)}`}>{statusLabel(o.status)}</span>
                <div className="rastreio-card-btns">
                  <button onClick={() => refreshStatus(o.id)} disabled={refreshingId === o.id}>
                    {refreshingId === o.id ? "Consultando..." : "🔄 Atualizar"}
                  </button>
                  <button onClick={() => openEditar(o)}>✏️ Editar</button>
                  <button onClick={() => arquivar(o.id, o.archived)}>{o.archived ? "Reativar" : "Arquivar"}</button>
                  <button onClick={() => excluir(o.id)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="rastreio-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="rastreio-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? "Editar Rastreio" : "Novo Rastreio"}</h3>

            <div className="rastreio-form-group">
              <label>Código de Rastreio</label>
              <input
                type="text"
                placeholder="NN349720023BR"
                value={form.trackingCode}
                onChange={(e) => setForm({ ...form, trackingCode: e.target.value })}
              />
            </div>
            <div className="rastreio-form-group">
              <label>Fornecedor</label>
              <input
                type="text"
                placeholder="AliExpress"
                value={form.supplier}
                onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              />
            </div>
            <div className="rastreio-form-group">
              <label>Produto vinculado</label>
              <input
                type="text"
                value={form.productName}
                onChange={(e) => setForm({ ...form, productName: e.target.value })}
              />
            </div>
            <div className="rastreio-form-group">
              <label>Valor Pago (R$)</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amountPaid}
                onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
              />
            </div>
            <div className="rastreio-form-group">
              <label>Previsão de Entrega</label>
              <input
                type="date"
                value={form.expectedDate}
                onChange={(e) => setForm({ ...form, expectedDate: e.target.value })}
              />
            </div>
            <div className="rastreio-form-group">
              <label>Notas</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {error && <p className="rastreio-error">{error}</p>}

            <div className="rastreio-modal-acoes">
              <button className="rastreio-btn-salvar" onClick={salvar} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button className="rastreio-btn-cancelar" onClick={() => setModalOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
