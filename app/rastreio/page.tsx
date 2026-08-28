"use client";
import { useState, useEffect, useMemo } from "react";
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
  realValue: number | null;
  realQuantity: number | null;
  paymentMethod: string | null;
  shippingAddress: string | null;
  trackingCode: string;
  notes: string | null;
  statusCategory: string | null;
  statusRaw: string | null;
  statusDetails: string | null;
  lastCheckedAt: string | null;
  archived: boolean;
  createdAt: string;
  createdBy: { name: string } | null;
  productId?: string | null;
  product?: { id: string; name: string } | null;
}

interface ProductOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "postado", label: "Postado" },
  { value: "em_transito", label: "Em Trânsito" },
  { value: "barrado", label: "Barrado / Proibido / Devolvido" },
  { value: "entregue", label: "Entregue" },
];

const emptyForm = {
  productId: "",
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

type SortKey =
  | "orderDate" | "buyerPerson" | "accountName" | "sellerName" | "externalOrderId"
  | "productName" | "quantity" | "unitValue" | "realValue" | "realQuantity"
  | "trackingCode" | "statusCategory";

// Colunas que o usuário pode ocultar pra caber na tela
const TOGGLABLE_COLUMNS: { key: string; label: string }[] = [
  { key: "orderDate", label: "Data" },
  { key: "buyerPerson", label: "Pessoa" },
  { key: "accountName", label: "Conta" },
  { key: "sellerName", label: "Vendedor" },
  { key: "externalOrderId", label: "Pedido" },
  { key: "productName", label: "Compra" },
  { key: "product", label: "Produto" },
  { key: "quantity", label: "Quan." },
  { key: "unitValue", label: "Frete" },
  { key: "realValue", label: "Valor Real" },
  { key: "realQuantity", label: "Qtd. Real" },
  { key: "custoUnitReal", label: "Custo Unit. Real" },
];

// Valor considerado do item: o Valor Real informado (total da compra).
// A coluna VALOR da planilha é o frete, não entra nesses totais.
function itemValue(o: TrackingOrder): number {
  return o.realValue ?? 0;
}

function itemQty(o: TrackingOrder): number {
  return o.realQuantity ?? o.quantity ?? 0;
}

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [compact, setCompact] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  useEffect(() => {
    fetchOrders();
  }, [showArchived]);

  useEffect(() => {
    fetch("/api/produtos")
      .then((r) => (r.ok ? r.json() : { products: [] }))
      .then((d) => setProductOptions((d.products || []).map((p: any) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);

  // Preferências de exibição salvas no navegador
  useEffect(() => {
    try {
      setCompact(localStorage.getItem("rastreio-compact") === "1");
      const saved = localStorage.getItem("rastreio-hidden-cols");
      if (saved) setHiddenCols(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  function toggleCompact() {
    const next = !compact;
    setCompact(next);
    try { localStorage.setItem("rastreio-compact", next ? "1" : "0"); } catch {}
  }

  function toggleCol(key: string) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem("rastreio-hidden-cols", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const show = (key: string) => !hiddenCols.has(key);
  const visibleColCount = 4 + TOGGLABLE_COLUMNS.filter((c) => show(c.key)).length; // expand + Rastreamento + Status + Ações fixas

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

  // ---- filtro + busca + ordenação ----
  const filtered = useMemo(() => {
    let list = orders;
    if (statusFilter === "sem_status") {
      list = list.filter((o) => !o.statusCategory);
    } else if (statusFilter) {
      list = list.filter((o) => o.statusCategory === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        [
          o.buyerPerson, o.accountName, o.sellerName, o.externalOrderId,
          o.productName, o.paymentMethod, o.shippingAddress, o.trackingCode,
          o.notes, o.statusRaw, o.product?.name,
          o.orderDate ? new Date(o.orderDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null,
          o.quantity != null ? String(o.quantity) : null,
          o.unitValue != null ? String(o.unitValue) : null,
        ]
          .filter(Boolean)
          .some((f) => (f as string).toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        let va: any = a[sortKey];
        let vb: any = b[sortKey];
        if (sortKey === "orderDate") {
          va = va ? new Date(va).getTime() : 0;
          vb = vb ? new Date(vb).getTime() : 0;
        }
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    return list;
  }, [orders, statusFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  // ---- contadores e totais financeiros ----
  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: orders.length, postado: 0, em_transito: 0, barrado: 0, entregue: 0, sem_status: 0 };
    for (const o of orders) {
      if (o.statusCategory && c[o.statusCategory] !== undefined) c[o.statusCategory]++;
      else c.sem_status++;
    }
    return c;
  }, [orders]);

  const totals = useMemo(() => {
    let recebido = 0, barrado = 0, caminho = 0, qtdRecebida = 0;
    for (const o of orders) {
      const v = itemValue(o);
      if (o.statusCategory === "entregue") {
        recebido += v;
        qtdRecebida += itemQty(o);
      } else if (o.statusCategory === "barrado") {
        barrado += v;
      } else {
        caminho += v;
      }
    }
    return { recebido, barrado, caminho, custoUnitReal: qtdRecebida > 0 ? recebido / qtdRecebida : 0 };
  }, [orders]);

  // ---- ações ----
  function openNovo() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  }

  function openEditar(o: TrackingOrder) {
    setEditingId(o.id);
    setForm({
      productId: o.productId || "",
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
        productId: form.productId || null,
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

  // Salva valor real / quantidade real digitados direto na célula
  async function saveRealField(id: string, field: "realValue" | "realQuantity", value: string) {
    const parsed = value.trim() === "" ? null : Number(value.replace(",", "."));
    const res = await fetch("/api/rastreio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, [field]: parsed }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: updated[field] } : o)));
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
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  }

  function parseHistorico(o: TrackingOrder): { descricao: string; data: string | null; local: string | null }[] {
    try {
      const d = JSON.parse(o.statusDetails || "{}");
      if (Array.isArray(d.historico) && d.historico.length > 0) return d.historico;
      if (d.eventoMaisRecente) return [d.eventoMaisRecente];
    } catch {}
    return [];
  }

  const statusCards: { key: string; label: string; icon: string; cls: string }[] = [
    { key: "todos", label: "Todos", icon: "📦", cls: "todos" },
    { key: "postado", label: "Postados", icon: "🔵", cls: "postado" },
    { key: "em_transito", label: "A Caminho", icon: "🟡", cls: "em_transito" },
    { key: "barrado", label: "Barrados", icon: "🔴", cls: "barrado" },
    { key: "entregue", label: "Entregues", icon: "🟢", cls: "entregue" },
    { key: "sem_status", label: "Sem Status", icon: "⚪", cls: "sem_status" },
  ];

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

      {/* Linha financeira: valores reais por classificação */}
      <div className="rastreio-cards rastreio-cards--money">
        <div className="rastreio-money-card rastreio-money-card--recebido">
          <span className="rastreio-card-label">Valor Real Recebido</span>
          <span className="rastreio-card-value">{formatCurrency(totals.recebido)}</span>
          <span className="rastreio-card-sub">itens entregues</span>
        </div>
        <div className="rastreio-money-card rastreio-money-card--barrado">
          <span className="rastreio-card-label">Valor Real Barrado</span>
          <span className="rastreio-card-value">{formatCurrency(totals.barrado)}</span>
          <span className="rastreio-card-sub">itens barrados / devolvidos</span>
        </div>
        <div className="rastreio-money-card rastreio-money-card--caminho">
          <span className="rastreio-card-label">Valor a Caminho</span>
          <span className="rastreio-card-value">{formatCurrency(totals.caminho)}</span>
          <span className="rastreio-card-sub">postados + em trânsito + sem status</span>
        </div>
        <div className="rastreio-money-card rastreio-money-card--custo">
          <span className="rastreio-card-label">Custo Unitário Real</span>
          <span className="rastreio-card-value">{totals.custoUnitReal > 0 ? formatCurrency(totals.custoUnitReal) : "—"}</span>
          <span className="rastreio-card-sub">recebido ÷ qtd. real entregue</span>
        </div>
      </div>

      {/* Fileira de quadrados: contagem por status, clicáveis pra filtrar */}
      <div className="rastreio-cards rastreio-cards--status">
        {statusCards.map((c) => (
          <button
            key={c.key}
            className={`rastreio-status-card rastreio-status-card--${c.cls} ${
              (c.key === "todos" && !statusFilter) || statusFilter === c.key ? "rastreio-status-card--active" : ""
            }`}
            onClick={() => setStatusFilter(c.key === "todos" ? null : c.key)}
          >
            <span className="rastreio-card-icon">{c.icon}</span>
            <span className="rastreio-card-count">{counts[c.key] ?? 0}</span>
            <span className="rastreio-card-label">{c.label}</span>
          </button>
        ))}
      </div>

      <div className="rastreio-toolbar">
        <input
          type="text"
          className="rastreio-busca"
          placeholder="🔍 Buscar por qualquer trecho: pessoa, produto, código, pedido, endereço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="rastreio-filtros">
          <button className={`rastreio-filtro-btn ${!showArchived ? "active" : ""}`} onClick={() => setShowArchived(false)}>
            Ativos
          </button>
          <button className={`rastreio-filtro-btn ${showArchived ? "active" : ""}`} onClick={() => setShowArchived(true)}>
            Todos (com arquivados)
          </button>
        </div>
        <button className={`rastreio-filtro-btn ${compact ? "active" : ""}`} onClick={toggleCompact} title="Diminui fonte e espaçamento pra caber mais na tela">
          {compact ? "🗜 Compacto" : "🗜 Normal"}
        </button>
        <div className="rastreio-cols-wrap">
          <button className="rastreio-filtro-btn" onClick={() => setColsMenuOpen(!colsMenuOpen)}>
            ⚙️ Colunas {hiddenCols.size > 0 ? `(${TOGGLABLE_COLUMNS.length - hiddenCols.size}/${TOGGLABLE_COLUMNS.length})` : ""}
          </button>
          {colsMenuOpen && (
            <div className="rastreio-cols-menu">
              {TOGGLABLE_COLUMNS.map((c) => (
                <label key={c.key}>
                  <input type="checkbox" checked={show(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rastreio-loading">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="rastreio-vazio">Nenhum pedido encontrado.</div>
      ) : (
        <div className="rastreio-tabela-wrap">
          <table className={`rastreio-tabela ${compact ? "rastreio-tabela--compact" : ""}`}>
            <thead>
              <tr>
                <th></th>
                {show("orderDate") && <th className="sortable" onClick={() => toggleSort("orderDate")}>Data{sortIndicator("orderDate")}</th>}
                {show("buyerPerson") && <th className="sortable" onClick={() => toggleSort("buyerPerson")}>Pessoa{sortIndicator("buyerPerson")}</th>}
                {show("accountName") && <th className="sortable" onClick={() => toggleSort("accountName")}>Conta{sortIndicator("accountName")}</th>}
                {show("sellerName") && <th className="sortable" onClick={() => toggleSort("sellerName")}>Vendedor{sortIndicator("sellerName")}</th>}
                {show("externalOrderId") && <th className="sortable" onClick={() => toggleSort("externalOrderId")}>Pedido{sortIndicator("externalOrderId")}</th>}
                {show("productName") && <th className="sortable" onClick={() => toggleSort("productName")}>Compra{sortIndicator("productName")}</th>}
                {show("product") && <th>Produto</th>}
                {show("quantity") && <th className="sortable" onClick={() => toggleSort("quantity")}>Quan.{sortIndicator("quantity")}</th>}
                {show("unitValue") && <th className="sortable" onClick={() => toggleSort("unitValue")}>Frete{sortIndicator("unitValue")}</th>}
                {show("realValue") && <th className="sortable" onClick={() => toggleSort("realValue")}>Valor Real{sortIndicator("realValue")}</th>}
                {show("realQuantity") && <th className="sortable" onClick={() => toggleSort("realQuantity")}>Qtd. Real{sortIndicator("realQuantity")}</th>}
                {show("custoUnitReal") && <th>Custo Unit. Real</th>}
                <th className="sortable" onClick={() => toggleSort("trackingCode")}>Rastreamento{sortIndicator("trackingCode")}</th>
                <th className="sortable" onClick={() => toggleSort("statusCategory")}>Status{sortIndicator("statusCategory")}</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const historico = expandedId === o.id ? parseHistorico(o) : [];
                const custoUnit = o.realValue != null && (o.realQuantity ?? o.quantity)
                  ? o.realValue / (o.realQuantity ?? o.quantity!)
                  : null;
                return (
                  <>
                    <tr key={o.id}>
                      <td>
                        <button
                          className="rastreio-expand-btn"
                          onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                          title="Ver histórico do rastreio"
                        >
                          {expandedId === o.id ? "−" : "+"}
                        </button>
                      </td>
                      {show("orderDate") && <td>{formatDate(o.orderDate)}</td>}
                      {show("buyerPerson") && <td>{o.buyerPerson}</td>}
                      {show("accountName") && <td>{o.accountName || "—"}</td>}
                      {show("sellerName") && <td>{o.sellerName || "—"}</td>}
                      {show("externalOrderId") && <td className="mono">{o.externalOrderId || "—"}</td>}
                      {show("productName") && <td className="rastreio-col-compra">{o.productName}</td>}
                      {show("product") && <td>{o.product?.name || "—"}</td>}
                      {show("quantity") && <td>{o.quantity ?? "—"}</td>}
                      {show("unitValue") && <td>{formatCurrency(o.unitValue)}</td>}
                      {show("realValue") && (
                        <td>
                          <input
                            key={`rv-${o.id}-${o.realValue}`}
                            type="text"
                            inputMode="decimal"
                            className="rastreio-inline-input"
                            placeholder="—"
                            defaultValue={o.realValue != null ? String(o.realValue).replace(".", ",") : ""}
                            onBlur={(e) => saveRealField(o.id, "realValue", e.target.value)}
                          />
                        </td>
                      )}
                      {show("realQuantity") && (
                        <td>
                          <input
                            key={`rq-${o.id}-${o.realQuantity}`}
                            type="text"
                            inputMode="numeric"
                            className="rastreio-inline-input rastreio-inline-input--qty"
                            placeholder="—"
                            defaultValue={o.realQuantity != null ? String(o.realQuantity) : ""}
                            onBlur={(e) => saveRealField(o.id, "realQuantity", e.target.value)}
                          />
                        </td>
                      )}
                      {show("custoUnitReal") && <td>{custoUnit != null ? formatCurrency(custoUnit) : "—"}</td>}
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
                    {expandedId === o.id && (
                      <tr key={`${o.id}-hist`} className="rastreio-hist-row">
                        <td colSpan={visibleColCount}>
                          <div className="rastreio-hist">
                            <strong>Histórico de {o.trackingCode}</strong>
                            {o.lastCheckedAt && (
                              <span className="rastreio-hist-checked">
                                última consulta: {new Date(o.lastCheckedAt).toLocaleString("pt-BR")}
                              </span>
                            )}
                            {historico.length === 0 ? (
                              <p className="rastreio-hist-vazio">Nenhum evento registrado ainda — clique em 🔄 pra consultar.</p>
                            ) : (
                              <ul>
                                {historico.map((h, i) => (
                                  <li key={i}>
                                    <span className="rastreio-hist-data">
                                      {h.data ? new Date(h.data).toLocaleString("pt-BR") : "—"}
                                    </span>
                                    <span className="rastreio-hist-desc">{h.descricao}</span>
                                    {h.local && <span className="rastreio-hist-local">{h.local}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
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
                <label>Produto cadastrado (opcional — <a href="/estoque/produtos" target="_blank" rel="noreferrer">gerenciar</a>)</label>
                <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">— nenhum —</option>
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
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
                <label>Frete (R$)</label>
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
