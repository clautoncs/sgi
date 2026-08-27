"use client";
import { useState, useEffect } from "react";
import "./rastreio.css";

interface TrackingOrder {
  id: string;
  orderDate: string | null;
  buyerPerson: string;
  accountName: string | null;
  sellerName: string | null;
  externalOrderId: string | null;
  productName: string;
  quantity: number | null;
  unitValue: number | null;
  paymentMethod: string | null;
  shippingAddress: string | null;
  trackingCode: string;
  notes: string | null;
  statusCategory: string | null;
  statusRaw: string | null;
  lastCheckedAt: string | null;
  archived: boolean;
  createdAt: string;
  createdBy: { name: string } | null;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "postado", label: "Postado" },
  { value: "em_transito", label: "Em Trânsito" },
  { value: "barrado", label: "Barrado / Proibido / Devolvido" },
  { value: "entregue", label: "Entregue" },
];

function statusLabel(status: string | null): string {
  if (!status) return "Sem status";
  return STATUS_OPTIONS.find((s) => s.value === status)?.label || status;
}

const emptyForm = {
  orderDate: "",
  buyerPerson: "",
  accountName: "",
  sellerName: "",
  externalOrderId: "",
  productName: "",
  quantity: "",
  unitValue: "",
  paymentMethod: "",
  shippingAddress: "",
  trackingCode: "",
  notes: "",
};

export default function RastreioPage() {
  const [orders, setOrders] = useState<TrackingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState<{ created: number; errors: any[] } | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshAllProgress, setRefreshAllProgress] = useState<{ done: number; total: number } | null>(null);

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
      orderDate: o.orderDate ? o.orderDate.slice(0, 10) : "",
      buyerPerson: o.buyerPerson,
      accountName: o.accountName || "",
      sellerName: o.sellerName || "",
      externalOrderId: o.externalOrderId || "",
      productName: o.productName,
      quantity: o.quantity != null ? String(o.quantity) : "",
      unitValue: o.unitValue != null ? String(o.unitValue) : "",
      paymentMethod: o.paymentMethod || "",
      shippingAddress: o.shippingAddress || "",
      trackingCode: o.trackingCode,
      notes: o.notes || "",
    });
    setError("");
    setModalOpen(true);
  }

  async function salvar() {
    if (!form.trackingCode.trim() || !form.buyerPerson.trim()) {
      setError("Código de rastreio e pessoa são obrigatórios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        orderDate: form.orderDate || null,
        buyerPerson: form.buyerPerson,
        accountName: form.accountName || null,
        sellerName: form.sellerName || null,
        externalOrderId: form.externalOrderId || null,
        productName: form.productName || "—",
        quantity: form.quantity || null,
        unitValue: form.unitValue ? form.unitValue.replace(",", ".") : null,
        paymentMethod: form.paymentMethod || null,
        shippingAddress: form.shippingAddress || null,
        trackingCode: form.trackingCode,
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

  async function importarEmMassa() {
    if (!bulkText.trim()) return;
    setBulkSaving(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/rastreio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_import", text: bulkText }),
      });
      const data = await res.json();
      setBulkResult(data);
      if (data.created > 0) fetchOrders();
    } finally {
      setBulkSaving(false);
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

  // Atualiza todos os códigos ainda não entregues, um a um, respeitando o
  // limite de 10 consultas/minuto da API (1 consulta a cada 6,5s).
  async function refreshAll() {
    const pending = orders.filter((o) => o.statusCategory !== "entregue" && !o.archived);
    if (pending.length === 0) return;
    setRefreshAllProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      try {
        await fetch("/api/rastreio", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: pending[i].id, action: "refresh" }),
        });
      } catch {}
      setRefreshAllProgress({ done: i + 1, total: pending.length });
      if (i < pending.length - 1) {
        await new Promise((r) => setTimeout(r, 6500));
      }
    }
    setRefreshAllProgress(null);
    fetchOrders();
  }

  async function setStatus(id: string, statusCategory: string) {
    const res = await fetch("/api/rastreio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "set_status", statusCategory }),
    });
    if (res.ok) fetchOrders();
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
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  return (
    <div className="rastreio-container">
      <div className="rastreio-header">
        <h1>Rastreio de Pedidos</h1>
        <div className="rastreio-header-btns">
          <button className="rastreio-btn-secundario" onClick={refreshAll} disabled={!!refreshAllProgress}>
            {refreshAllProgress
              ? `🔄 Consultando ${refreshAllProgress.done}/${refreshAllProgress.total}...`
              : "🔄 Atualizar Todos"}
          </button>
          <button className="rastreio-btn-secundario" onClick={() => { setBulkText(""); setBulkResult(null); setBulkOpen(true); }}>
            📋 Colar da Planilha
          </button>
          <button className="rastreio-btn-novo" onClick={openNovo}>+ Novo Rastreio</button>
        </div>
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
        <div className="rastreio-tabela-wrap">
          <table className="rastreio-tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th>Pessoa</th>
                <th>Conta</th>
                <th>Vendedor</th>
                <th>Pedido</th>
                <th>Compra</th>
                <th>Quan.</th>
                <th>Valor</th>
                <th>Pagam.</th>
                <th>Endereço</th>
                <th>Rastreamento</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.orderDate)}</td>
                  <td>{o.buyerPerson}</td>
                  <td>{o.accountName || "—"}</td>
                  <td>{o.sellerName || "—"}</td>
                  <td className="mono">{o.externalOrderId || "—"}</td>
                  <td>{o.productName}</td>
                  <td>{o.quantity ?? "—"}</td>
                  <td>{formatCurrency(o.unitValue)}</td>
                  <td>{o.paymentMethod || "—"}</td>
                  <td>{o.shippingAddress || "—"}</td>
                  <td className="mono">{o.trackingCode}</td>
                  <td>
                    <select
                      className={`rastreio-status-select status-${o.statusCategory || "sem_status"}`}
                      value={o.statusCategory || ""}
                      onChange={(e) => setStatus(o.id, e.target.value)}
                    >
                      <option value="">Sem status</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    {o.statusRaw && (
                      <div className="rastreio-status-raw" title={o.statusRaw}>{o.statusRaw}</div>
                    )}
                  </td>
                  <td>
                    <div className="rastreio-tabela-acoes">
                      <button onClick={() => refreshStatus(o.id)} disabled={refreshingId === o.id} title="Atualizar via API">
                        {refreshingId === o.id ? "..." : "🔄"}
                      </button>
                      <button onClick={() => openEditar(o)} title="Editar">✏️</button>
                      <button onClick={() => arquivar(o.id, o.archived)} title={o.archived ? "Reativar" : "Arquivar"}>
                        {o.archived ? "↩️" : "📥"}
                      </button>
                      <button onClick={() => excluir(o.id)} title="Excluir">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="rastreio-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="rastreio-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? "Editar Rastreio" : "Novo Rastreio"}</h3>

            <div className="rastreio-form-grid">
              <div className="rastreio-form-group">
                <label>Data</label>
                <input type="date" value={form.orderDate} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Pessoa</label>
                <input type="text" value={form.buyerPerson} onChange={(e) => setForm({ ...form, buyerPerson: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Conta</label>
                <input type="text" value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Vendedor</label>
                <input type="text" value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Pedido (nº)</label>
                <input type="text" value={form.externalOrderId} onChange={(e) => setForm({ ...form, externalOrderId: e.target.value })} />
              </div>
              <div className="rastreio-form-group rastreio-form-group--wide">
                <label>Compra</label>
                <input type="text" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Quantidade</label>
                <input type="text" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Valor (unitário)</label>
                <input type="text" inputMode="decimal" placeholder="0,00" value={form.unitValue} onChange={(e) => setForm({ ...form, unitValue: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Pagamento</label>
                <input type="text" value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} />
              </div>
              <div className="rastreio-form-group">
                <label>Endereço</label>
                <input type="text" value={form.shippingAddress} onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })} />
              </div>
              <div className="rastreio-form-group rastreio-form-group--wide">
                <label>Código de Rastreio</label>
                <input type="text" placeholder="NN349720023BR" value={form.trackingCode} onChange={(e) => setForm({ ...form, trackingCode: e.target.value })} />
              </div>
              <div className="rastreio-form-group rastreio-form-group--wide">
                <label>Notas</label>
                <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
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

      {bulkOpen && (
        <div className="rastreio-modal-overlay" onClick={() => setBulkOpen(false)}>
          <div className="rastreio-modal rastreio-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3>Colar da Planilha</h3>
            <p className="rastreio-hint">
              Selecione as linhas na sua planilha (sem o cabeçalho) na ordem Data, Pessoa, Conta, Vendedor, Pedido, Compra, Quan., Valor, Pagam., Endereço, Rastreamento — copie (Ctrl+C) e cole abaixo.
            </p>
            <textarea
              className="rastreio-bulk-textarea"
              rows={10}
              placeholder="Cole aqui as linhas copiadas da planilha..."
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            {bulkResult && (
              <div className="rastreio-bulk-resultado">
                <p>✅ {bulkResult.created} registro(s) importado(s).</p>
                {bulkResult.errors.length > 0 && (
                  <>
                    <p>⚠️ {bulkResult.errors.length} linha(s) com problema:</p>
                    <ul>
                      {bulkResult.errors.map((e, i) => (
                        <li key={i}>{e.reason} — <span className="mono">{e.line.slice(0, 60)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <div className="rastreio-modal-acoes">
              <button className="rastreio-btn-salvar" onClick={importarEmMassa} disabled={bulkSaving}>
                {bulkSaving ? "Importando..." : "Importar"}
              </button>
              <button className="rastreio-btn-cancelar" onClick={() => setBulkOpen(false)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
