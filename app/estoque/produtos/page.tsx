"use client";
import { useState, useEffect } from "react";
import "./produtos.css";

interface ProductRollup {
  rastreios: number;
  valorReal: number;
  qtdReal: number;
  custoUnitReal: number | null;
  porStatus: Record<string, number>;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  notes: string | null;
  isActive: boolean;
  rollup?: ProductRollup;
}

const emptyForm = { name: "", sku: "", category: "", notes: "" };

export default function ProdutosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [busca, setBusca] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchProducts();
  }, [showInactive]);

  async function fetchProducts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/produtos?rollup=true&inactive=${showInactive}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
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

  function openEditar(p: Product) {
    setEditingId(p.id);
    setForm({ name: p.name, sku: p.sku || "", category: p.category || "", notes: p.notes || "" });
    setError("");
    setModalOpen(true);
  }

  async function salvar() {
    if (!form.name.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/produtos", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erro ao salvar.");
        return;
      }
      setModalOpen(false);
      fetchProducts();
    } finally {
      setSaving(false);
    }
  }

  async function toggleAtivo(p: Product) {
    const res = await fetch("/api/produtos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, isActive: !p.isActive }),
    });
    if (res.ok) fetchProducts();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir este produto?")) return;
    const res = await fetch(`/api/produtos?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao excluir.");
      return;
    }
    fetchProducts();
  }

  function fmt(v: number | null): string {
    if (v == null) return "—";
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  const filtered = products.filter((p) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return [p.name, p.sku, p.category, p.notes].filter(Boolean).some((f) => (f as string).toLowerCase().includes(q));
  });

  return (
    <div className="produtos-container">
      <div className="produtos-header">
        <h1>Produtos</h1>
        <div className="produtos-header-btns">
          <a href="/rastreio" className="produtos-link">📦 Rastreio</a>
          <button className="produtos-btn-novo" onClick={openNovo}>+ Novo Produto</button>
        </div>
      </div>

      <p className="produtos-hint">
        Cadastro interno pra controle de demanda: os rastreios apontam pra cá, mas os números (valor real e quantidade) ficam no próprio rastreio — aqui você vê o consolidado por produto.
      </p>

      <div className="produtos-toolbar">
        <input
          type="text"
          className="produtos-busca"
          placeholder="🔍 Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button className={`produtos-filtro-btn ${showInactive ? "active" : ""}`} onClick={() => setShowInactive(!showInactive)}>
          {showInactive ? "Mostrando todos" : "Só ativos"}
        </button>
      </div>

      {loading ? (
        <div className="produtos-loading">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="produtos-vazio">Nenhum produto cadastrado ainda. Clique em "+ Novo Produto".</div>
      ) : (
        <div className="produtos-grid">
          {filtered.map((p) => (
            <div key={p.id} className={`produto-card ${!p.isActive ? "produto-card--inativo" : ""}`}>
              <div className="produto-card-top">
                <div>
                  <h3>{p.name}</h3>
                  <div className="produto-card-meta">
                    {p.sku && <span>SKU: {p.sku}</span>}
                    {p.category && <span>{p.category}</span>}
                    {!p.isActive && <span className="produto-badge-inativo">Inativo</span>}
                  </div>
                </div>
                <div className="produto-card-acoes">
                  <button onClick={() => openEditar(p)} title="Editar">✏️</button>
                  <button onClick={() => toggleAtivo(p)} title={p.isActive ? "Desativar" : "Reativar"}>
                    {p.isActive ? "📥" : "↩️"}
                  </button>
                  <button onClick={() => excluir(p.id)} title="Excluir">🗑</button>
                </div>
              </div>

              {p.rollup && p.rollup.rastreios > 0 ? (
                <div className="produto-card-rollup">
                  <div className="produto-stat">
                    <span className="produto-stat-label">Rastreios</span>
                    <span className="produto-stat-value">{p.rollup.rastreios}</span>
                  </div>
                  <div className="produto-stat">
                    <span className="produto-stat-label">Valor Real</span>
                    <span className="produto-stat-value">{fmt(p.rollup.valorReal)}</span>
                  </div>
                  <div className="produto-stat">
                    <span className="produto-stat-label">Qtd. Real</span>
                    <span className="produto-stat-value">{p.rollup.qtdReal}</span>
                  </div>
                  <div className="produto-stat">
                    <span className="produto-stat-label">Custo Unit. Real</span>
                    <span className="produto-stat-value">{fmt(p.rollup.custoUnitReal)}</span>
                  </div>
                  <div className="produto-stat produto-stat--status">
                    {p.rollup.porStatus.entregue > 0 && <span className="ps ps--entregue">🟢 {p.rollup.porStatus.entregue}</span>}
                    {p.rollup.porStatus.em_transito > 0 && <span className="ps ps--transito">🟡 {p.rollup.porStatus.em_transito}</span>}
                    {p.rollup.porStatus.postado > 0 && <span className="ps ps--postado">🔵 {p.rollup.porStatus.postado}</span>}
                    {p.rollup.porStatus.barrado > 0 && <span className="ps ps--barrado">🔴 {p.rollup.porStatus.barrado}</span>}
                    {p.rollup.porStatus.sem_status > 0 && <span className="ps">⚪ {p.rollup.porStatus.sem_status}</span>}
                  </div>
                </div>
              ) : (
                <div className="produto-card-rollup produto-card-rollup--vazio">Nenhum rastreio vinculado ainda</div>
              )}

              {p.notes && <p className="produto-card-notas">{p.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="produtos-modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="produtos-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? "Editar Produto" : "Novo Produto"}</h3>
            <div className="produtos-form-group">
              <label>Nome</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="SSD 120GB SATA" />
            </div>
            <div className="produtos-form-group">
              <label>SKU / Código interno (opcional)</label>
              <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="produtos-form-group">
              <label>Categoria (opcional)</label>
              <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="SSD, Memória, Processador..." />
            </div>
            <div className="produtos-form-group">
              <label>Notas (opcional)</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {error && <p className="produtos-error">{error}</p>}
            <div className="produtos-modal-acoes">
              <button className="produtos-btn-salvar" onClick={salvar} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button className="produtos-btn-cancelar" onClick={() => setModalOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
