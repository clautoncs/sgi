"use client";
import { useState, useEffect, useCallback } from "react";
import "./shopee.css";

interface ShopeeStatus {
  connected: boolean;
  shopId: number;
  partnerId: number;
  taxRate: number;
  hasCredentials: boolean;
}

interface Product {
  item_id: number;
  item_name: string;
  item_status: string;
  price_info: any[];
  stock_info_v2: any;
  image: any;
  category_id: number;
}

interface Order {
  order_sn: string;
  order_status: string;
  create_time: number;
  pay_time: number;
  total_amount: number;
  actual_shipping_fee: number;
  estimated_shipping_fee: number;
  buyer_username: string;
  item_list: any[];
}

type PeriodFilter = "today" | "week" | "month" | "custom";

export default function ShopeePage() {
  const [status, setStatus] = useState<ShopeeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "dashboard" | "products" | "orders" | "config">("overview");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prevOrders, setPrevOrders] = useState<Order[]>([]);
  const [escrowList, setEscrowList] = useState<any[]>([]);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [savingCostId, setSavingCostId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Config form
  const [partnerId, setPartnerId] = useState("");
  const [partnerKey, setPartnerKey] = useState("");
  const [shopId, setShopId] = useState("");
  const [taxRate, setTaxRate] = useState("12");
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/shopee?action=status");
      const data = await res.json();
      setStatus(data);
      if (data.partnerId) setPartnerId(String(data.partnerId));
      if (data.shopId) setShopId(String(data.shopId));
      if (data.taxRate) setTaxRate(String(data.taxRate));
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch("/api/shopee?action=costs");
      const data = await res.json();
      setCosts(data.costs || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (status?.connected) fetchCosts(); }, [status?.connected, fetchCosts]);

  const handleSaveCost = async (itemId: string, value: string) => {
    const cost = Number(value.replace(",", "."));
    if (!Number.isFinite(cost) || cost < 0) return;
    setSavingCostId(itemId);
    try {
      await fetch("/api/shopee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_cost", itemId, cost }),
      });
      setCosts((prev) => ({ ...prev, [itemId]: cost }));
    } catch { /* ignore */ }
    finally { setSavingCostId(null); }
  };

  const getTimeRange = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Math.floor(today.getTime() / 1000);

    switch (period) {
      case "today":
        return { from: todayTs, to: now };
      case "week":
        return { from: todayTs - 7 * 86400, to: now };
      case "month":
        return { from: todayTs - 30 * 86400, to: now };
      case "custom":
        return {
          from: customFrom ? Math.floor(new Date(customFrom).getTime() / 1000) : todayTs - 30 * 86400,
          to: customTo ? Math.floor(new Date(customTo).getTime() / 1000) : now,
        };
      default:
        return { from: todayTs - 30 * 86400, to: now };
    }
  }, [period, customFrom, customTo]);

  const getPreviousTimeRange = useCallback(() => {
    const { from, to } = getTimeRange();
    const span = to - from;
    return { from: from - span, to: from };
  }, [getTimeRange]);

  const fetchOrders = useCallback(async () => {
    if (!status?.connected) return;
    setLoadingData(true);
    try {
      const { from, to } = getTimeRange();
      const res = await fetch(`/api/shopee?action=orders&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      setOrders(data.orders || []);
    } catch { /* ignore */ }
    finally { setLoadingData(false); }
  }, [status, getTimeRange]);

  const fetchProducts = useCallback(async () => {
    if (!status?.connected) return;
    setLoadingData(true);
    try {
      const res = await fetch("/api/shopee?action=products");
      const data = await res.json();
      setProducts(data.products || []);
    } catch { /* ignore */ }
    finally { setLoadingData(false); }
  }, [status]);

  const fetchPreviousOrders = useCallback(async () => {
    if (!status?.connected) return;
    try {
      const { from, to } = getPreviousTimeRange();
      const res = await fetch(`/api/shopee?action=orders&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      setPrevOrders(data.orders || []);
    } catch { /* ignore */ }
  }, [status, getPreviousTimeRange]);

  const fetchFinance = useCallback(async () => {
    if (!status?.connected) return;
    try {
      const { from, to } = getTimeRange();
      const res = await fetch(`/api/shopee?action=finance&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      setEscrowList(data.escrowList || []);
    } catch { /* ignore */ }
  }, [status, getTimeRange]);

  const fetchDashboardData = useCallback(async () => {
    if (!status?.connected) return;
    setLoadingDashboard(true);
    try {
      await Promise.all([fetchOrders(), fetchProducts(), fetchFinance(), fetchPreviousOrders()]);
    } finally {
      setLoadingDashboard(false);
    }
  }, [status, fetchOrders, fetchProducts, fetchFinance, fetchPreviousOrders]);

  useEffect(() => {
    if (!status?.connected) return;
    if (activeTab === "orders") fetchOrders();
    if (activeTab === "products") fetchProducts();
    if (activeTab === "overview") fetchOrders();
    if (activeTab === "dashboard") fetchDashboardData();
  }, [status, activeTab, period, customFrom, customTo]);

  const handleSaveCredentials = async () => {
    setSaving(true);
    try {
      await fetch("/api/shopee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_credentials",
          partnerId,
          partnerKey,
          shopId,
          taxRate,
        }),
      });
      await fetchStatus();
      alert("Credenciais salvas com sucesso!");
    } catch {
      alert("Erro ao salvar credenciais");
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async () => {
    const res = await fetch("/api/shopee?action=auth_url");
    const data = await res.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    } else {
      alert(data.error || "Erro ao gerar URL de autorização");
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Deseja desconectar a loja Shopee?")) return;
    await fetch("/api/shopee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    await fetchStatus();
  };

  // Cálculos do overview
  const tax = Number(taxRate) / 100;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const totalShipping = orders.reduce((sum, o) => sum + (o.actual_shipping_fee || o.estimated_shipping_fee || 0), 0);
  const totalTax = totalRevenue * tax;
  const shopeeCommission = totalRevenue * 0.20; // 20% padrão Shopee
  const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0;

  // Agrupar vendas por produto e cruzar com o custo cadastrado em /produtos.
  // Sem custo cadastrado, cai no fallback de 40% (mesma estimativa de antes).
  const productSales: Record<string, { itemId: string; name: string; qty: number; revenue: number }> = {};
  orders.forEach((order) => {
    (order.item_list || []).forEach((item: any) => {
      const key = String(item.item_id);
      if (!productSales[key]) {
        productSales[key] = { itemId: key, name: item.item_name || `Produto #${item.item_id}`, qty: 0, revenue: 0 };
      }
      productSales[key].qty += item.model_quantity_purchased || 1;
      productSales[key].revenue += (item.model_discounted_price || item.model_original_price || 0) * (item.model_quantity_purchased || 1);
    });
  });
  const productSalesArr = Object.values(productSales)
    .map((p) => {
      const hasCost = Object.prototype.hasOwnProperty.call(costs, p.itemId);
      const cost = hasCost ? costs[p.itemId] * p.qty : p.revenue * 0.40;
      return { ...p, hasCost, cost };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalCost = productSalesArr.reduce((sum, p) => sum + p.cost, 0);
  const productsWithCostCount = productSalesArr.filter((p) => p.hasCost).length;
  const costCoveragePct = productSalesArr.length > 0 ? (productsWithCostCount / productSalesArr.length) * 100 : 0;

  const netProfit = totalRevenue - totalCost - totalTax - shopeeCommission - totalShipping;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const pct = (v: number) => (totalRevenue > 0 ? (v / totalRevenue) * 100 : 0);

  // Agrupar vendas por dia
  const dailySales: Record<string, { date: string; revenue: number; orders: number }> = {};
  orders.forEach((order) => {
    const d = new Date((order.pay_time || order.create_time) * 1000);
    const key = d.toISOString().split("T")[0];
    if (!dailySales[key]) dailySales[key] = { date: key, revenue: 0, orders: 0 };
    dailySales[key].revenue += order.total_amount || 0;
    dailySales[key].orders += 1;
  });
  const dailySalesArr = Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));

  // Pedidos por status
  const statusCounts: Record<string, number> = {};
  orders.forEach((o) => {
    const s = o.order_status || "DESCONHECIDO";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  const statusArr = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  // Comparativo com período anterior (mesma duração, imediatamente antes)
  const prevRevenue = prevOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : (totalRevenue > 0 ? 100 : 0);
  const ordersGrowth = prevOrders.length > 0 ? ((orders.length - prevOrders.length) / prevOrders.length) * 100 : (orders.length > 0 ? 100 : 0);

  // Financeiro real (escrow) - nomes de campo variam conforme versão da API da Shopee, por isso os fallbacks
  const escrowNet = escrowList.reduce((sum, e) => sum + (e.escrow_amount ?? e.escrow_amount_after_adjustment ?? 0), 0);
  const escrowGross = escrowList.reduce((sum, e) => sum + (e.buyer_total_amount ?? e.order_income?.buyer_total_amount ?? 0), 0);
  const escrowFees = escrowGross > escrowNet ? escrowGross - escrowNet : 0;

  // Produtos ativos sem venda no período
  const soldProductIds = new Set<string>();
  orders.forEach((o) => (o.item_list || []).forEach((it: any) => soldProductIds.add(String(it.item_id))));
  const activeProducts = products.filter((p) => p.item_status === "NORMAL");
  const staleProducts = activeProducts.filter((p) => !soldProductIds.has(String(p.item_id)));

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (loading) {
    return (
      <div className="shopee-loading">
        <div className="shopee-spinner" />
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="shopee-container">
      <div className="shopee-header">
        <div className="shopee-header__left">
          <h1 className="shopee-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            Shopee
          </h1>
          <span className={`shopee-status ${status?.connected ? "shopee-status--on" : "shopee-status--off"}`}>
            {status?.connected ? "Conectada" : "Desconectada"}
          </span>
        </div>
        <div className="shopee-header__right">
          {status?.connected ? (
            <button className="btn btn--outline-danger" onClick={handleDisconnect}>Desconectar</button>
          ) : status?.hasCredentials ? (
            <button className="btn btn--primary" onClick={handleConnect}>Conectar Loja</button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="shopee-tabs">
        <button className={`shopee-tab ${activeTab === "overview" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("overview")}>
          Overview
        </button>
        <button className={`shopee-tab ${activeTab === "dashboard" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("dashboard")}>
          Dashboard
        </button>
        <button className={`shopee-tab ${activeTab === "products" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("products")}>
          Produtos
        </button>
        <button className={`shopee-tab ${activeTab === "orders" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("orders")}>
          Pedidos
        </button>
        <button className={`shopee-tab ${activeTab === "config" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("config")}>
          Configuração
        </button>
      </div>

      {/* Filtro de período (geral, vale para todas as abas) */}
      {status?.connected && (
        <div className="shopee-period">
          <button className={`period-btn ${period === "today" ? "period-btn--active" : ""}`} onClick={() => setPeriod("today")}>Hoje</button>
          <button className={`period-btn ${period === "week" ? "period-btn--active" : ""}`} onClick={() => setPeriod("week")}>Semana</button>
          <button className={`period-btn ${period === "month" ? "period-btn--active" : ""}`} onClick={() => setPeriod("month")}>Mês</button>
          <button className={`period-btn ${period === "custom" ? "period-btn--active" : ""}`} onClick={() => setPeriod("custom")}>Período</button>
          {period === "custom" && (
            <div className="period-custom">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span>até</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {/* OVERVIEW */}
      {activeTab === "overview" && (
        <div className="shopee-overview">
          {!status?.connected ? (
            <div className="shopee-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              <h2>Conecte sua loja Shopee</h2>
              <p>Configure as credenciais na aba "Configuração" e conecte sua loja para visualizar os dados.</p>
            </div>
          ) : (
            <>
              {/* Cards de resumo */}
              <div className="overview-cards">
                <div className="ov-card ov-card--revenue">
                  <span className="ov-card__label">Faturamento</span>
                  <span className="ov-card__value">{fmt(totalRevenue)}</span>
                  <span className="ov-card__sub">{orders.length} pedidos</span>
                </div>
                <div className="ov-card ov-card--ticket">
                  <span className="ov-card__label">Ticket Médio</span>
                  <span className="ov-card__value">{fmt(avgTicket)}</span>
                </div>
                <div className="ov-card ov-card--shipping">
                  <span className="ov-card__label">Frete Total</span>
                  <span className="ov-card__value">{fmt(totalShipping)}</span>
                  <span className="ov-card__sub">{pct(totalShipping).toFixed(1)}% da receita</span>
                </div>
                <div className="ov-card ov-card--tax">
                  <span className="ov-card__label">Impostos ({taxRate}%)</span>
                  <span className="ov-card__value">{fmt(totalTax)}</span>
                  <span className="ov-card__sub">{pct(totalTax).toFixed(1)}% da receita</span>
                </div>
                <div className="ov-card ov-card--commission">
                  <span className="ov-card__label">Comissão Shopee</span>
                  <span className="ov-card__value">{fmt(shopeeCommission)}</span>
                  <span className="ov-card__sub">~20% do faturamento</span>
                </div>
                <div className="ov-card ov-card--cost">
                  <span className="ov-card__label">Custo dos Produtos</span>
                  <span className="ov-card__value">{fmt(totalCost)}</span>
                  <span className="ov-card__sub">{pct(totalCost).toFixed(1)}% da receita · {productsWithCostCount}/{productSalesArr.length} produtos com custo cadastrado</span>
                </div>
                <div className={`ov-card ${netProfit >= 0 ? "ov-card--profit" : "ov-card--loss"}`}>
                  <span className="ov-card__label">Lucro Líquido</span>
                  <span className="ov-card__value">{fmt(netProfit)}</span>
                  <span className="ov-card__sub">Margem: {margin.toFixed(1)}%</span>
                </div>
              </div>

              {costCoveragePct < 100 && productSalesArr.length > 0 && (
                <div className="cost-warning">
                  <strong>{(100 - costCoveragePct).toFixed(0)}% dos produtos vendidos</strong> nesse período ainda não têm custo cadastrado — o lucro acima usa uma estimativa de 40% pra eles. Cadastre o custo na aba "Produtos" pra ver o número real.
                </div>
              )}

              {/* Vendas por dia */}
              <div className="overview-section">
                <h3>Vendas por Dia</h3>
                {loadingData ? (
                  <div className="shopee-spinner-sm" />
                ) : dailySalesArr.length === 0 ? (
                  <p className="text-muted">Nenhuma venda no período selecionado.</p>
                ) : (
                  <div className="daily-chart">
                    {dailySalesArr.map((d) => {
                      const maxRev = Math.max(...dailySalesArr.map(x => x.revenue));
                      const pct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
                      return (
                        <div key={d.date} className="daily-bar" title={`${d.date}: ${fmt(d.revenue)} (${d.orders} pedidos)`}>
                          <div className="daily-bar__fill" style={{ height: `${Math.max(pct, 5)}%` }} />
                          <span className="daily-bar__label">{d.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top produtos */}
              <div className="overview-section">
                <h3>Ranking de Produtos</h3>
                {loadingData ? (
                  <div className="shopee-spinner-sm" />
                ) : productSalesArr.length === 0 ? (
                  <p className="text-muted">Nenhum produto vendido no período.</p>
                ) : (
                  <table className="shopee-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Produto</th>
                        <th>Qtd</th>
                        <th>Receita</th>
                        <th>Custo</th>
                        <th>Imposto</th>
                        <th>Comissão</th>
                        <th>Lucro</th>
                        <th>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSalesArr.slice(0, 20).map((p, i) => {
                        const pTax = p.revenue * tax;
                        const pComm = p.revenue * 0.20;
                        const pProfit = p.revenue - p.cost - pTax - pComm;
                        const pMargin = p.revenue > 0 ? (pProfit / p.revenue) * 100 : 0;
                        return (
                          <tr key={p.itemId}>
                            <td>{i + 1}</td>
                            <td className="product-name">{p.name}</td>
                            <td>{p.qty}</td>
                            <td>{fmt(p.revenue)}</td>
                            <td>
                              {fmt(p.cost)}
                              {!p.hasCost && <span className="badge badge--gray cost-badge">estimado</span>}
                            </td>
                            <td className="text-danger">{fmt(pTax)}</td>
                            <td className="text-danger">{fmt(pComm)}</td>
                            <td className={pProfit >= 0 ? "text-success" : "text-danger"}>{fmt(pProfit)}</td>
                            <td className={pMargin >= 0 ? "text-success" : "text-danger"}>{pMargin.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="shopee-dashboard">
          {!status?.connected ? (
            <div className="shopee-empty">
              <p>Conecte sua loja para ver o dashboard.</p>
            </div>
          ) : loadingDashboard ? (
            <div className="shopee-spinner" />
          ) : (
            <>
              <div className="overview-cards">
                <div className="ov-card ov-card--revenue">
                  <span className="ov-card__label">Receita do Período</span>
                  <span className="ov-card__value">{fmt(totalRevenue)}</span>
                  <span className={`growth-badge ${revenueGrowth >= 0 ? "growth-badge--up" : "growth-badge--down"}`}>
                    {revenueGrowth >= 0 ? "+" : ""}{revenueGrowth.toFixed(1)}% vs período anterior
                  </span>
                </div>
                <div className="ov-card ov-card--ticket">
                  <span className="ov-card__label">Pedidos</span>
                  <span className="ov-card__value">{orders.length}</span>
                  <span className={`growth-badge ${ordersGrowth >= 0 ? "growth-badge--up" : "growth-badge--down"}`}>
                    {ordersGrowth >= 0 ? "+" : ""}{ordersGrowth.toFixed(1)}% vs período anterior
                  </span>
                </div>
                <div className="ov-card ov-card--profit">
                  <span className="ov-card__label">Repasse Líquido Shopee</span>
                  <span className="ov-card__value">{fmt(escrowNet)}</span>
                  <span className="ov-card__sub">{escrowList.length} pedidos liquidados</span>
                </div>
                <div className="ov-card ov-card--tax">
                  <span className="ov-card__label">Taxas Cobradas (real)</span>
                  <span className="ov-card__value">{fmt(escrowFees)}</span>
                  <span className="ov-card__sub">Diferença entre valor bruto e repasse</span>
                </div>
              </div>

              <div className="overview-section">
                <h3>Pedidos por Status</h3>
                {statusArr.length === 0 ? (
                  <p className="text-muted">Nenhum pedido no período selecionado.</p>
                ) : (
                  <div className="status-list">
                    {statusArr.map(([statusName, count]) => (
                      <div className="status-row" key={statusName}>
                        <span className="status-row__label">{statusName}</span>
                        <div className="status-row__bar">
                          <div
                            className="status-row__fill"
                            style={{ width: `${orders.length > 0 ? (count / orders.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="status-row__count">
                          {count} ({orders.length > 0 ? ((count / orders.length) * 100).toFixed(0) : 0}%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="overview-section">
                <h3>Produtos Sem Giro no Período</h3>
                <p className="text-muted" style={{ marginBottom: 12 }}>
                  {staleProducts.length} de {activeProducts.length} produtos ativos não venderam nada nesse período.
                </p>
                {staleProducts.length === 0 ? (
                  <p className="text-muted">Todos os produtos ativos tiveram venda no período.</p>
                ) : (
                  <>
                    <table className="shopee-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Produto</th>
                          <th>Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staleProducts.slice(0, 30).map((p) => (
                          <tr key={p.item_id}>
                            <td>{p.item_id}</td>
                            <td className="product-name">{p.item_name}</td>
                            <td>{p.stock_info_v2?.summary_info?.total_available_stock ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {staleProducts.length > 30 && (
                      <p className="text-muted" style={{ marginTop: 8 }}>
                        + {staleProducts.length - 30} outros produtos sem giro.
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* PRODUTOS */}
      {activeTab === "products" && (
        <div className="shopee-products">
          {!status?.connected ? (
            <div className="shopee-empty">
              <p>Conecte sua loja para ver os produtos.</p>
            </div>
          ) : loadingData ? (
            <div className="shopee-spinner" />
          ) : (
            <table className="shopee-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>Status</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Custo</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const key = String(p.item_id);
                  const price = p.price_info?.[0]?.current_price || p.price_info?.[0]?.original_price || 0;
                  const draft = costDrafts[key] ?? (costs[key] !== undefined ? String(costs[key]) : "");
                  const costValue = costs[key];
                  const priceMargin = costValue !== undefined && price > 0 ? ((price - costValue) / price) * 100 : null;
                  return (
                    <tr key={p.item_id}>
                      <td>{p.item_id}</td>
                      <td className="product-name">{p.item_name}</td>
                      <td>
                        <span className={`badge ${p.item_status === "NORMAL" ? "badge--green" : "badge--gray"}`}>
                          {p.item_status}
                        </span>
                      </td>
                      <td>{price ? fmt(price) : "—"}</td>
                      <td>{p.stock_info_v2?.summary_info?.total_available_stock ?? "—"}</td>
                      <td>
                        <input
                          type="number"
                          className="cost-input"
                          min="0"
                          step="0.01"
                          placeholder="0,00"
                          value={draft}
                          onChange={(e) => setCostDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={(e) => { if (e.target.value !== "") handleSaveCost(key, e.target.value); }}
                        />
                        {savingCostId === key && <span className="cost-input__saving">salvando...</span>}
                      </td>
                      <td className={priceMargin === null ? "text-muted" : priceMargin >= 0 ? "text-success" : "text-danger"}>
                        {priceMargin === null ? "—" : `${priceMargin.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted">Nenhum produto encontrado</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* PEDIDOS */}
      {activeTab === "orders" && (
        <div className="shopee-orders">
          {!status?.connected ? (
            <div className="shopee-empty">
              <p>Conecte sua loja para ver os pedidos.</p>
            </div>
          ) : loadingData ? (
            <div className="shopee-spinner" />
          ) : (
            <table className="shopee-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>Comprador</th>
                  <th>Itens</th>
                  <th>Total</th>
                  <th>Frete</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.order_sn}>
                    <td className="order-sn">{o.order_sn}</td>
                    <td>{new Date((o.pay_time || o.create_time) * 1000).toLocaleDateString("pt-BR")}</td>
                    <td>{o.buyer_username || "—"}</td>
                    <td>{o.item_list?.length || 0}</td>
                    <td>{fmt(o.total_amount || 0)}</td>
                    <td>{fmt(o.actual_shipping_fee || o.estimated_shipping_fee || 0)}</td>
                    <td>
                      <span className={`badge ${o.order_status === "COMPLETED" ? "badge--green" : o.order_status === "CANCELLED" ? "badge--red" : "badge--yellow"}`}>
                        {o.order_status}
                      </span>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted">Nenhum pedido no período</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CONFIGURAÇÃO */}
      {activeTab === "config" && (
        <div className="shopee-config">
          <div className="config-card">
            <h3>Credenciais da API Shopee</h3>
            <p className="text-muted">Configure as credenciais obtidas no Shopee Open Platform para conectar sua loja.</p>

            <div className="config-form">
              <div className="form-group">
                <label>Partner ID (App ID)</label>
                <input
                  type="text"
                  value={partnerId}
                  onChange={e => setPartnerId(e.target.value)}
                  placeholder="Ex: 2001887"
                />
              </div>
              <div className="form-group">
                <label>Partner Key (App Secret)</label>
                <input
                  type="password"
                  value={partnerKey}
                  onChange={e => setPartnerKey(e.target.value)}
                  placeholder="Chave secreta do app"
                />
              </div>
              <div className="form-group">
                <label>Shop ID</label>
                <input
                  type="text"
                  value={shopId}
                  onChange={e => setShopId(e.target.value)}
                  placeholder="ID numérico da loja"
                />
              </div>
              <div className="form-group">
                <label>Taxa de Imposto (%)</label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={e => setTaxRate(e.target.value)}
                  placeholder="12"
                  min="0"
                  max="100"
                  step="0.5"
                />
              </div>

              <div className="config-actions">
                <button className="btn btn--primary" onClick={handleSaveCredentials} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar Credenciais"}
                </button>
                {status?.hasCredentials && !status?.connected && (
                  <button className="btn btn--success" onClick={handleConnect}>
                    Conectar Loja Shopee
                  </button>
                )}
              </div>
            </div>

            {status?.connected && (
              <div className="config-status">
                <div className="config-status__badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" width="20" height="20">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                  Loja conectada — Shop ID: {status.shopId}
                </div>
              </div>
            )}
          </div>

          <div className="config-card">
            <h3>Como obter as credenciais</h3>
            <ol className="config-steps">
              <li>Acesse <a href="https://open.shopee.com" target="_blank" rel="noopener">open.shopee.com</a> e faça login</li>
              <li>Vá em "Console" → "Create App"</li>
              <li>Preencha os dados do app (Callback URL: <code>{typeof window !== 'undefined' ? window.location.origin : 'https://sgi.ilinked.com.br'}/api/shopee/callback</code>)</li>
              <li>Após aprovação, copie o <strong>Partner ID</strong> e <strong>Partner Key</strong></li>
              <li>O <strong>Shop ID</strong> aparece no <a href="https://seller.shopee.com.br" target="_blank" rel="noopener">Seller Centre</a> nas configurações da loja</li>
              <li>Cole os dados acima e clique em "Conectar Loja Shopee"</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
