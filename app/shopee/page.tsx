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
  const [activeTab, setActiveTab] = useState<"overview" | "products" | "orders" | "config">("overview");
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingData, setLoadingData] = useState(false);

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

  useEffect(() => {
    if (status?.connected && activeTab === "orders") fetchOrders();
    if (status?.connected && activeTab === "products") fetchProducts();
    if (status?.connected && activeTab === "overview") fetchOrders();
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
  const estimatedCost = totalRevenue * 0.40; // Estimativa de custo (40% - ajustável)
  const netProfit = totalRevenue - estimatedCost - totalTax - shopeeCommission - totalShipping;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const avgTicket = orders.length > 0 ? totalRevenue / orders.length : 0;

  // Agrupar vendas por produto
  const productSales: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
  orders.forEach((order) => {
    (order.item_list || []).forEach((item: any) => {
      const key = String(item.item_id);
      if (!productSales[key]) {
        productSales[key] = { name: item.item_name || `Produto #${item.item_id}`, qty: 0, revenue: 0, cost: 0 };
      }
      productSales[key].qty += item.model_quantity_purchased || 1;
      productSales[key].revenue += (item.model_discounted_price || item.model_original_price || 0) * (item.model_quantity_purchased || 1);
    });
  });
  const productSalesArr = Object.values(productSales).sort((a, b) => b.revenue - a.revenue);

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

      {/* Filtro de período (overview e pedidos) */}
      {(activeTab === "overview" || activeTab === "orders") && status?.connected && (
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
                </div>
                <div className="ov-card ov-card--tax">
                  <span className="ov-card__label">Impostos ({taxRate}%)</span>
                  <span className="ov-card__value">{fmt(totalTax)}</span>
                </div>
                <div className="ov-card ov-card--commission">
                  <span className="ov-card__label">Comissão Shopee</span>
                  <span className="ov-card__value">{fmt(shopeeCommission)}</span>
                  <span className="ov-card__sub">~20% do faturamento</span>
                </div>
                <div className={`ov-card ${netProfit >= 0 ? "ov-card--profit" : "ov-card--loss"}`}>
                  <span className="ov-card__label">Lucro Líquido</span>
                  <span className="ov-card__value">{fmt(netProfit)}</span>
                  <span className="ov-card__sub">Margem: {margin.toFixed(1)}%</span>
                </div>
              </div>

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
                        <th>Imposto</th>
                        <th>Comissão</th>
                        <th>Lucro Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSalesArr.slice(0, 20).map((p, i) => {
                        const pTax = p.revenue * tax;
                        const pComm = p.revenue * 0.20;
                        const pCost = p.revenue * 0.40;
                        const pProfit = p.revenue - pCost - pTax - pComm;
                        return (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td className="product-name">{p.name}</td>
                            <td>{p.qty}</td>
                            <td>{fmt(p.revenue)}</td>
                            <td className="text-danger">{fmt(pTax)}</td>
                            <td className="text-danger">{fmt(pComm)}</td>
                            <td className={pProfit >= 0 ? "text-success" : "text-danger"}>{fmt(pProfit)}</td>
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
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.item_id}>
                    <td>{p.item_id}</td>
                    <td className="product-name">{p.item_name}</td>
                    <td>
                      <span className={`badge ${p.item_status === "NORMAL" ? "badge--green" : "badge--gray"}`}>
                        {p.item_status}
                      </span>
                    </td>
                    <td>
                      {p.price_info?.[0]
                        ? fmt(p.price_info[0].current_price || p.price_info[0].original_price || 0)
                        : "—"}
                    </td>
                    <td>{p.stock_info_v2?.summary_info?.total_available_stock ?? "—"}</td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted">Nenhum produto encontrado</td></tr>
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
