"use client";
import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import type { ReactNode } from "react";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
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
  has_model?: boolean;
}

interface ProductModel {
  model_id: number;
  model_name: string;
  price_info: any[];
  stock_info_v2: any;
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

type PeriodFilter = "today" | "yesterday" | "week" | "month" | "custom";

// O servidor roda em UTC, mas a loja opera no horário de Brasília
// (UTC-3, sem horário de verão desde 2019) — todo cálculo de "dia"
// (hoje/ontem/vendas por dia) precisa considerar esse fuso, senão
// vendas feitas à noite caem no dia seguinte.
const BR_TIMEZONE = "America/Sao_Paulo";
const BR_OFFSET_SEC = 3 * 3600;

function brDateKey(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BR_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

// Meia-noite (00:00) de Brasília de uma data "YYYY-MM-DD", como epoch UTC real.
function brMidnightFromDateStr(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000) + BR_OFFSET_SEC;
}

const DEFAULT_OVERVIEW_ORDER = ["pizza", "summary", "daily", "ranking", "detailed"];
const OVERVIEW_ORDER_STORAGE_KEY = "shopee-overview-order";
// Largura de cada caixa em colunas (grade de 4) — pizza e vendas por dia
// ficam lado a lado (2+2) por padrão, o resto ocupa a linha inteira.
const DEFAULT_OVERVIEW_SPANS: Record<string, number> = {
  pizza: 2,
  summary: 4,
  daily: 2,
  ranking: 4,
  detailed: 4,
};
const OVERVIEW_SPANS_STORAGE_KEY = "shopee-overview-spans";
const CANCELLED_STATUSES = ["CANCELLED", "IN_CANCEL"];

// Tabela de comissão da Shopee BR por faixa de preço, vigente desde
// mar/2026 (fonte pública, não é a doc oficial da Shopee — confirme no seu
// extrato se mudou). Comissão = preço*taxa + valor fixo da faixa.
const SHOPEE_COMMISSION_BRACKETS = [
  { min: 0, max: 79.99, rate: 0.20, fixed: 4 },
  { min: 80, max: 99.99, rate: 0.14, fixed: 16 },
  { min: 100, max: 199.99, rate: 0.14, fixed: 20 },
  { min: 200, max: Infinity, rate: 0.14, fixed: 26 },
];
const SHOPEE_CPF_EXTRA_FEE = 3; // R$3 fixo por item pra vendedor CPF (fonte pública)
const SHOPEE_BRACKET_BOUNDARIES = [80, 100, 200];

function getShopeeBracket(price: number) {
  return (
    SHOPEE_COMMISSION_BRACKETS.find((b) => price >= b.min && price <= b.max) ||
    SHOPEE_COMMISSION_BRACKETS[SHOPEE_COMMISSION_BRACKETS.length - 1]
  );
}

function shopeeCommissionFee(price: number): number {
  const b = getShopeeBracket(price);
  return price * b.rate + b.fixed;
}

export default function ShopeePage() {
  const [status, setStatus] = useState<ShopeeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "dashboard" | "products" | "orders" | "calculator" | "config">("overview");
  const [period, setPeriod] = useState<PeriodFilter>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prevOrders, setPrevOrders] = useState<Order[]>([]);
  const [escrowList, setEscrowList] = useState<any[]>([]);
  const [adsExpense, setAdsExpense] = useState(0);
  const [adsExpenseByProduct, setAdsExpenseByProduct] = useState<Record<string, number>>({});
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [freightOverrides, setFreightOverrides] = useState<Record<string, number>>({});
  const [packagingCosts, setPackagingCosts] = useState<Record<string, number>>({});
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [productModels, setProductModels] = useState<Record<string, ProductModel[]>>({});
  const [loadingModels, setLoadingModels] = useState<Set<string>>(new Set());
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [freightDrafts, setFreightDrafts] = useState<Record<string, string>>({});
  const [packagingDrafts, setPackagingDrafts] = useState<Record<string, string>>({});
  const [savingCostId, setSavingCostId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [overviewOrder, setOverviewOrder] = useState<string[]>(DEFAULT_OVERVIEW_ORDER);
  const [overviewSpans, setOverviewSpans] = useState<Record<string, number>>(DEFAULT_OVERVIEW_SPANS);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [orderStatusFilter, setOrderStatusFilter] = useState<"paid" | "all" | "cancelled" | "unpaid">("paid");

  // Calculadora de preço/margem
  const [calcBusinessType, setCalcBusinessType] = useState<"cnpj" | "cpf">("cnpj");
  const [calcProductCost, setCalcProductCost] = useState("");
  const [calcAdditionalCosts, setCalcAdditionalCosts] = useState("");
  const [calcShopeeAdvance, setCalcShopeeAdvance] = useState("");
  const [calcSalesTax, setCalcSalesTax] = useState("");
  const [calcProfitMargin, setCalcProfitMargin] = useState("");
  const [calcManualSaleValue, setCalcManualSaleValue] = useState("");
  const [calcFeaturedCampaigns, setCalcFeaturedCampaigns] = useState(false);
  const [calcAdsPercent, setCalcAdsPercent] = useState("");
  const [calcAffiliateEnabled, setCalcAffiliateEnabled] = useState(false);
  const [calcAffiliatePercent, setCalcAffiliatePercent] = useState("1");

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OVERVIEW_ORDER_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length === DEFAULT_OVERVIEW_ORDER.length &&
          DEFAULT_OVERVIEW_ORDER.every((k) => parsed.includes(k))
        ) {
          setOverviewOrder(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(OVERVIEW_ORDER_STORAGE_KEY, JSON.stringify(overviewOrder)); } catch { /* ignore */ }
  }, [overviewOrder]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OVERVIEW_SPANS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Object.keys(DEFAULT_OVERVIEW_SPANS).every((k) => k in parsed)) {
          setOverviewSpans(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(OVERVIEW_SPANS_STORAGE_KEY, JSON.stringify(overviewSpans)); } catch { /* ignore */ }
  }, [overviewSpans]);

  const handleSetSpan = (key: string, span: number) => {
    setOverviewSpans((prev) => ({ ...prev, [key]: span }));
  };

  const handleBoxDrop = (targetKey: string) => {
    setDragOverKey(null);
    if (!draggedKey || draggedKey === targetKey) { setDraggedKey(null); return; }
    setOverviewOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggedKey);
      const toIdx = next.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedKey);
      return next;
    });
    setDraggedKey(null);
  };

  const fetchCosts = useCallback(async () => {
    try {
      const res = await fetch("/api/shopee?action=costs");
      const data = await res.json();
      setCosts(data.costs || {});
    } catch { /* ignore */ }
  }, []);

  const fetchExtraCosts = useCallback(async () => {
    try {
      const [freightRes, packagingRes] = await Promise.all([
        fetch("/api/shopee?action=extra_costs&type=freight"),
        fetch("/api/shopee?action=extra_costs&type=packaging"),
      ]);
      const [freightData, packagingData] = await Promise.all([freightRes.json(), packagingRes.json()]);
      setFreightOverrides(freightData.costs || {});
      setPackagingCosts(packagingData.costs || {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { if (status?.connected) { fetchCosts(); fetchExtraCosts(); } }, [status?.connected, fetchCosts, fetchExtraCosts]);

  const handleToggleExpand = async (itemId: number) => {
    const key = String(itemId);
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (!productModels[key]) {
      setLoadingModels((prev) => new Set(prev).add(key));
      try {
        const res = await fetch(`/api/shopee?action=models&item_id=${itemId}`);
        const data = await res.json();
        setProductModels((prev) => ({ ...prev, [key]: data.models || [] }));
      } catch { /* ignore */ }
      finally {
        setLoadingModels((prev) => { const next = new Set(prev); next.delete(key); return next; });
      }
    }
  };

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

  const handleSaveExtraCost = async (type: "freight" | "packaging", itemId: string, valueStr: string) => {
    const value = Number(valueStr.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return;
    setSavingCostId(`${type}:${itemId}`);
    try {
      await fetch("/api/shopee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_extra_cost", type, itemId, value }),
      });
      if (type === "freight") setFreightOverrides((prev) => ({ ...prev, [itemId]: value }));
      else setPackagingCosts((prev) => ({ ...prev, [itemId]: value }));
    } catch { /* ignore */ }
    finally { setSavingCostId(null); }
  };

  const getTimeRange = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    // Início do dia de hoje na hora de Brasília (não na hora do servidor, que é UTC).
    const todayTs = Math.floor((now - BR_OFFSET_SEC) / 86400) * 86400 + BR_OFFSET_SEC;

    switch (period) {
      case "today":
        return { from: todayTs, to: now };
      case "yesterday":
        return { from: todayTs - 86400, to: todayTs };
      case "week":
        return { from: todayTs - 7 * 86400, to: now };
      case "month":
        return { from: todayTs - 30 * 86400, to: now };
      case "custom":
        return {
          // "até" é inclusivo: vai até o fim do dia escolhido (meia-noite seguinte), não só o início.
          from: customFrom ? brMidnightFromDateStr(customFrom) : todayTs - 30 * 86400,
          to: customTo ? brMidnightFromDateStr(customTo) + 86400 : now,
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

  // Cada fetch guarda seu próprio "número da vez" — se a resposta chegar
  // depois de uma busca mais nova ter começado (troca rápida de período),
  // ela é descartada em vez de sobrescrever o estado com dado do período errado.
  const ordersRequestId = useRef(0);
  const fetchOrders = useCallback(async () => {
    if (!status?.connected) return;
    const myRequestId = ++ordersRequestId.current;
    setLoadingData(true);
    try {
      const { from, to } = getTimeRange();
      const res = await fetch(`/api/shopee?action=orders&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      if (myRequestId !== ordersRequestId.current) return;
      setOrders(data.orders || []);
    } catch { /* ignore */ }
    finally { if (myRequestId === ordersRequestId.current) setLoadingData(false); }
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

  const prevOrdersRequestId = useRef(0);
  const fetchPreviousOrders = useCallback(async () => {
    if (!status?.connected) return;
    const myRequestId = ++prevOrdersRequestId.current;
    try {
      const { from, to } = getPreviousTimeRange();
      const res = await fetch(`/api/shopee?action=orders&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      if (myRequestId !== prevOrdersRequestId.current) return;
      setPrevOrders(data.orders || []);
    } catch { /* ignore */ }
  }, [status, getPreviousTimeRange]);

  const financeRequestId = useRef(0);
  const fetchFinance = useCallback(async () => {
    if (!status?.connected) return;
    const myRequestId = ++financeRequestId.current;
    try {
      const { from, to } = getTimeRange();
      const res = await fetch(`/api/shopee?action=finance&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      if (myRequestId !== financeRequestId.current) return;
      setEscrowList(data.escrowList || []);
    } catch { /* ignore */ }
  }, [status, getTimeRange]);

  const adsRequestId = useRef(0);
  const fetchAdsSpend = useCallback(async () => {
    if (!status?.connected) return;
    const myRequestId = ++adsRequestId.current;
    try {
      const { from, to } = getTimeRange();
      const res = await fetch(`/api/shopee?action=ads_performance&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      if (myRequestId !== adsRequestId.current) return;
      setAdsExpense(data.totalExpense || 0);
    } catch { /* ignore */ }
  }, [status, getTimeRange]);

  const adsByProductRequestId = useRef(0);
  const fetchAdsByProduct = useCallback(async () => {
    if (!status?.connected) return;
    const myRequestId = ++adsByProductRequestId.current;
    try {
      const { from, to } = getTimeRange();
      const res = await fetch(`/api/shopee?action=ads_by_product&time_from=${from}&time_to=${to}`);
      const data = await res.json();
      if (myRequestId !== adsByProductRequestId.current) return;
      setAdsExpenseByProduct(data.expenseByItem || {});
    } catch { /* ignore */ }
  }, [status, getTimeRange]);

  // Conta quantas das buscas do lote atual (pedidos, produtos, financeiro...)
  // já terminaram, pra mostrar uma porcentagem real de progresso em vez de
  // só um "carregando" genérico.
  const [loadingProgress, setLoadingProgress] = useState(0);
  const trackProgress = useCallback((promises: Promise<any>[]) => {
    const total = promises.length;
    let done = 0;
    setLoadingProgress(total > 0 ? 0 : 100);
    return Promise.all(
      promises.map((p) =>
        p.finally(() => {
          done += 1;
          setLoadingProgress(Math.round((done / total) * 100));
        })
      )
    );
  }, []);

  const fetchDashboardData = useCallback(async () => {
    if (!status?.connected) return;
    setLoadingDashboard(true);
    try {
      await trackProgress([fetchOrders(), fetchProducts(), fetchFinance(), fetchPreviousOrders()]);
    } finally {
      setLoadingDashboard(false);
    }
  }, [status, fetchOrders, fetchProducts, fetchFinance, fetchPreviousOrders, trackProgress]);

  useEffect(() => {
    if (!status?.connected) return;
    if (activeTab === "orders") trackProgress([fetchOrders()]);
    if (activeTab === "products") trackProgress([fetchProducts()]);
    if (activeTab === "overview") trackProgress([fetchOrders(), fetchProducts(), fetchAdsSpend(), fetchAdsByProduct()]);
    if (activeTab === "dashboard") fetchDashboardData();
  }, [status, activeTab, period, customFrom, customTo]);

  const handleRefresh = () => {
    if (activeTab === "orders") trackProgress([fetchOrders()]);
    if (activeTab === "products") trackProgress([fetchProducts()]);
    if (activeTab === "overview") trackProgress([fetchOrders(), fetchProducts(), fetchAdsSpend(), fetchAdsByProduct()]);
    if (activeTab === "dashboard") fetchDashboardData();
  };

  const isRefreshing = loadingData || loadingDashboard;

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

  // Filtro de status: por padrão só entram pedidos "efetivados" (pagos e não
  // cancelados) em todos os cálculos e listagens da página.
  const matchesOrderStatusFilter = (o: Order) => {
    if (orderStatusFilter === "all") return true;
    if (orderStatusFilter === "unpaid") return o.order_status === "UNPAID";
    if (orderStatusFilter === "cancelled") return CANCELLED_STATUSES.includes(o.order_status);
    return o.order_status !== "UNPAID" && !CANCELLED_STATUSES.includes(o.order_status);
  };
  const filteredOrders = orders.filter(matchesOrderStatusFilter);
  const filteredPrevOrders = prevOrders.filter(matchesOrderStatusFilter);
  const unpaidCount = orders.filter((o) => o.order_status === "UNPAID").length;
  const cancelledCount = orders.filter((o) => CANCELLED_STATUSES.includes(o.order_status)).length;

  // Cálculos do overview
  const tax = Number(taxRate) / 100;
  const totalRevenue = filteredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const totalShipping = filteredOrders.reduce((sum, o) => sum + (o.actual_shipping_fee || o.estimated_shipping_fee || 0), 0);
  const totalTax = totalRevenue * tax;
  const shopeeCommission = totalRevenue * 0.20; // 20% padrão Shopee
  const avgTicket = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

  // Agrupar vendas por produto e cruzar com o custo cadastrado em /produtos.
  // Sem custo cadastrado, cai no fallback de 40% (mesma estimativa de antes).
  const productHasModel: Record<string, boolean> = {};
  products.forEach((p) => { productHasModel[String(p.item_id)] = !!p.has_model; });

  const productSales: Record<string, { itemId: string; baseItemId: string; name: string; qty: number; revenue: number; freight: number; packaging: number }> = {};
  const qtyByBaseItem: Record<string, number> = {};
  filteredOrders.forEach((order) => {
    // Frete é do pedido, não do item — rateado entre os itens do mesmo
    // pedido proporcional à quantidade de cada um, a não ser que o produto
    // tenha um frete manual cadastrado (aí ele vence o rateio automático).
    const orderShipping = order.actual_shipping_fee || order.estimated_shipping_fee || 0;
    const orderItems = order.item_list || [];
    const orderTotalQty = orderItems.reduce((s: number, it: any) => s + (it.model_quantity_purchased || 1), 0);
    orderItems.forEach((item: any) => {
      // Produtos com variação usam custo por variação (item+model); sem
      // variação, a chave é só o item_id — mesmo esquema usado ao salvar
      // o custo na aba Produtos.
      const baseItemId = String(item.item_id);
      const isVariation = productHasModel[baseItemId] && item.model_id;
      const key = isVariation ? `${item.item_id}:${item.model_id}` : baseItemId;
      const name = isVariation && item.model_name
        ? `${item.item_name || `Produto #${item.item_id}`} — ${item.model_name}`
        : (item.item_name || `Produto #${item.item_id}`);
      if (!productSales[key]) {
        productSales[key] = { itemId: key, baseItemId, name, qty: 0, revenue: 0, freight: 0, packaging: 0 };
      }
      const qty = item.model_quantity_purchased || 1;
      const autoFreight = orderTotalQty > 0 ? (qty / orderTotalQty) * orderShipping : 0;
      const lineFreight = freightOverrides[key] !== undefined ? freightOverrides[key] * qty : autoFreight;
      const linePackaging = packagingCosts[key] !== undefined ? packagingCosts[key] * qty : 0;
      productSales[key].qty += qty;
      productSales[key].revenue += (item.model_discounted_price || item.model_original_price || 0) * qty;
      productSales[key].freight += lineFreight;
      productSales[key].packaging += linePackaging;
      qtyByBaseItem[baseItemId] = (qtyByBaseItem[baseItemId] || 0) + qty;
    });
  });

  // Ads é investido no anúncio do produto (item_id), não por variação — então
  // o gasto real do item é rateado entre as variações proporcional à
  // quantidade vendida de cada uma. Sem gasto registrado nesse produto, fica 0.
  const productSalesArr = Object.values(productSales)
    .map((p) => {
      const hasCost = Object.prototype.hasOwnProperty.call(costs, p.itemId);
      const cost = hasCost ? costs[p.itemId] * p.qty : p.revenue * 0.40;
      const itemAdsTotal = adsExpenseByProduct[p.baseItemId] || 0;
      const itemQtyTotal = qtyByBaseItem[p.baseItemId] || 0;
      const adsCost = itemQtyTotal > 0 ? itemAdsTotal * (p.qty / itemQtyTotal) : 0;
      return { ...p, hasCost, cost, adsCost };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalCost = productSalesArr.reduce((sum, p) => sum + p.cost, 0);
  const productsWithCostCount = productSalesArr.filter((p) => p.hasCost).length;
  const costCoveragePct = productSalesArr.length > 0 ? (productsWithCostCount / productSalesArr.length) * 100 : 0;
  // Usa o frete ajustado (respeitando overrides manuais por produto) no
  // lucro, mas o card "Frete Total" continua mostrando o valor real cobrado.
  const totalFreightAdjusted = productSalesArr.reduce((sum, p) => sum + p.freight, 0);
  const totalPackaging = productSalesArr.reduce((sum, p) => sum + p.packaging, 0);

  const netProfit = totalRevenue - totalCost - totalTax - shopeeCommission - totalFreightAdjusted - adsExpense - totalPackaging;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const pct = (v: number) => (totalRevenue > 0 ? (v / totalRevenue) * 100 : 0);

  // Gráfico de pizza por produto (top 7 + "Outros" agrupando o resto, senão vira ilegível com centenas de fatias)
  const PIE_COLORS = ["#ee4d2d", "#3b82f6", "#f59e0b", "#8b5cf6", "#22c55e", "#14b8a6", "#ec4899", "#64748b"];
  const PIE_TOP_N = 7;
  const pieTop = productSalesArr.slice(0, PIE_TOP_N);
  const pieRest = productSalesArr.slice(PIE_TOP_N);
  const pieData = [
    ...pieTop.map((p) => ({ name: p.name, revenue: p.revenue, qty: p.qty, cost: p.cost, adsCost: p.adsCost, freight: p.freight, packaging: p.packaging, hasCost: p.hasCost })),
    ...(pieRest.length > 0
      ? [{
          name: `Outros (${pieRest.length} produtos)`,
          revenue: pieRest.reduce((s, p) => s + p.revenue, 0),
          qty: pieRest.reduce((s, p) => s + p.qty, 0),
          cost: pieRest.reduce((s, p) => s + p.cost, 0),
          adsCost: pieRest.reduce((s, p) => s + p.adsCost, 0),
          freight: pieRest.reduce((s, p) => s + p.freight, 0),
          packaging: pieRest.reduce((s, p) => s + p.packaging, 0),
          hasCost: false,
        }]
      : []),
  ];

  // Cada venda individual (uma linha por item vendido, não agrupado por produto)
  const saleLines = filteredOrders
    .flatMap((order) => {
      const orderShipping = order.actual_shipping_fee || order.estimated_shipping_fee || 0;
      const orderItems = order.item_list || [];
      const orderTotalQty = orderItems.reduce((s: number, it: any) => s + (it.model_quantity_purchased || 1), 0);
      return orderItems.map((item: any) => {
        const qty = item.model_quantity_purchased || 1;
        const unitPrice = item.model_discounted_price || item.model_original_price || 0;
        const subtotal = unitPrice * qty;
        const baseItemId = String(item.item_id);
        const isVariation = productHasModel[baseItemId] && item.model_id;
        const costKey = isVariation ? `${item.item_id}:${item.model_id}` : baseItemId;
        const name = isVariation && item.model_name
          ? `${item.item_name || `Produto #${item.item_id}`} — ${item.model_name}`
          : (item.item_name || `Produto #${item.item_id}`);
        const hasCost = Object.prototype.hasOwnProperty.call(costs, costKey);
        const cost = hasCost ? costs[costKey] * qty : subtotal * 0.40;
        const lineTax = subtotal * tax;
        const lineComm = subtotal * 0.20;
        const itemAdsTotal = adsExpenseByProduct[baseItemId] || 0;
        const itemQtyTotal = qtyByBaseItem[baseItemId] || 0;
        const lineAds = itemQtyTotal > 0 ? itemAdsTotal * (qty / itemQtyTotal) : 0;
        const autoFreight = orderTotalQty > 0 ? (qty / orderTotalQty) * orderShipping : 0;
        const lineFreight = freightOverrides[costKey] !== undefined ? freightOverrides[costKey] * qty : autoFreight;
        const linePackaging = packagingCosts[costKey] !== undefined ? packagingCosts[costKey] * qty : 0;
        const profit = subtotal - cost - lineTax - lineComm - lineAds - lineFreight - linePackaging;
        const margin = subtotal > 0 ? (profit / subtotal) * 100 : 0;
        return {
          orderSn: order.order_sn,
          date: order.pay_time || order.create_time,
          name,
          qty,
          unitPrice,
          subtotal,
          hasCost,
          cost,
          tax: lineTax,
          commission: lineComm,
          ads: lineAds,
          freight: lineFreight,
          packaging: linePackaging,
          profit,
          margin,
        };
      });
    })
    .sort((a, b) => b.date - a.date);

  // Agrupar vendas por dia
  const dailySales: Record<string, { date: string; revenue: number; orders: number }> = {};
  filteredOrders.forEach((order) => {
    const key = brDateKey(order.pay_time || order.create_time);
    if (!dailySales[key]) dailySales[key] = { date: key, revenue: 0, orders: 0 };
    dailySales[key].revenue += order.total_amount || 0;
    dailySales[key].orders += 1;
  });
  const dailySalesArr = Object.values(dailySales).sort((a, b) => a.date.localeCompare(b.date));

  // Pedidos por status
  const statusCounts: Record<string, number> = {};
  filteredOrders.forEach((o) => {
    const s = o.order_status || "DESCONHECIDO";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });
  const statusArr = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  // Comparativo com período anterior (mesma duração, imediatamente antes)
  const prevRevenue = filteredPrevOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : (totalRevenue > 0 ? 100 : 0);
  const ordersGrowth = filteredPrevOrders.length > 0 ? ((filteredOrders.length - filteredPrevOrders.length) / filteredPrevOrders.length) * 100 : (filteredOrders.length > 0 ? 100 : 0);

  // Financeiro real (escrow) - nomes de campo variam conforme versão da API da Shopee, por isso os fallbacks
  const escrowNet = escrowList.reduce((sum, e) => sum + (e.escrow_amount ?? e.escrow_amount_after_adjustment ?? 0), 0);
  const escrowGross = escrowList.reduce((sum, e) => sum + (e.buyer_total_amount ?? e.order_income?.buyer_total_amount ?? 0), 0);
  const escrowFees = escrowGross > escrowNet ? escrowGross - escrowNet : 0;

  // Produtos ativos sem venda no período
  const soldProductIds = new Set<string>();
  filteredOrders.forEach((o) => (o.item_list || []).forEach((it: any) => soldProductIds.add(String(it.item_id))));
  const activeProducts = products.filter((p) => p.item_status === "NORMAL");
  const staleProducts = activeProducts.filter((p) => !soldProductIds.has(String(p.item_id)));

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Calculadora de preço/margem — modo direto (calcula o preço de venda a
  // partir da margem desejada) ou reverso (parte de um valor de venda manual
  // e calcula a margem resultante). Taxas ficam todas editáveis pelo usuário
  // porque a alíquota real varia por CNPJ/CPF e por conta — não tem como
  // cravar um número oficial aqui.
  const calc = (() => {
    const custo = Number(calcProductCost.replace(",", ".")) || 0;
    const custosAdicionais = Number(calcAdditionalCosts.replace(",", ".")) || 0;
    const custoTotal = custo + custosAdicionais;
    const shopeeAntecipa = (Number(calcShopeeAdvance.replace(",", ".")) || 0) / 100;
    const imposto = (Number(calcSalesTax.replace(",", ".")) || 0) / 100;
    const campanhas = calcFeaturedCampaigns ? 0.025 : 0;
    const afiliado = calcAffiliateEnabled ? (Number(calcAffiliatePercent.replace(",", ".")) || 0) / 100 : 0;
    const adsPct = (Number(calcAdsPercent.replace(",", ".")) || 0) / 100;
    const margemDesejada = (Number(calcProfitMargin.replace(",", ".")) || 0) / 100;
    const manual = calcManualSaleValue ? Number(calcManualSaleValue.replace(",", ".")) || 0 : 0;
    const cpfExtra = calcBusinessType === "cpf" ? SHOPEE_CPF_EXTRA_FEE : 0;

    // Taxas percentuais que incidem sobre o preço, fora a comissão por
    // faixa (que tem também um valor fixo, resolvido à parte por faixa).
    const outrasTaxasPct = shopeeAntecipa + imposto + campanhas + afiliado;

    if (custoTotal <= 0) {
      return { valid: false as const, reason: "Informe o custo do produto." };
    }

    let precoVenda: number;
    let modo: "direto" | "reverso";

    if (manual > 0) {
      precoVenda = manual;
      modo = "reverso";
    } else {
      // Resolve a equação dentro de cada faixa (comissão tem taxa + fixo
      // constantes ali dentro) e usa a primeira cujo preço resultante
      // realmente cai na própria faixa.
      let encontrado: number | null = null;
      for (const b of SHOPEE_COMMISSION_BRACKETS) {
        const denominador = 1 - b.rate - outrasTaxasPct - margemDesejada * (1 + adsPct);
        if (denominador <= 0) continue;
        const candidato = (custoTotal + b.fixed + cpfExtra) / denominador;
        if (candidato >= b.min && candidato <= b.max) {
          encontrado = candidato;
          break;
        }
      }
      if (encontrado === null) {
        return { valid: false as const, reason: "Essa combinação de taxas + margem não fecha em nenhuma faixa de preço da Shopee. Reduza a margem ou as taxas." };
      }
      precoVenda = encontrado;
      modo = "direto";
    }

    const comissaoShopee = shopeeCommissionFee(precoVenda);
    const outrasTaxasValor = outrasTaxasPct * precoVenda;
    const taxasValor = comissaoShopee + outrasTaxasValor + cpfExtra;
    let lucroBruto: number;
    if (modo === "reverso") {
      lucroBruto = (precoVenda - custoTotal - comissaoShopee - outrasTaxasValor - cpfExtra) / (1 + adsPct);
    } else {
      lucroBruto = margemDesejada * precoVenda;
    }
    const adsValor = adsPct * lucroBruto;
    const lucroLiquido = lucroBruto - adsValor;
    const margemBruta = precoVenda > 0 ? (lucroBruto / precoVenda) * 100 : 0;
    const margemLiquida = precoVenda > 0 ? (lucroLiquido / precoVenda) * 100 : 0;

    // Alerta de proximidade da faixa: mostra quanto custaria ficar do outro
    // lado do limite mais próximo (pra cima ou pra baixo).
    const bracketAtual = getShopeeBracket(precoVenda);
    let alertaFaixa: string | null = null;
    for (const limite of SHOPEE_BRACKET_BOUNDARIES) {
      const distancia = Math.abs(precoVenda - limite);
      if (distancia <= 20) {
        const precoAbaixo = limite - 0.01;
        const precoAcima = limite;
        const comissaoAbaixo = shopeeCommissionFee(precoAbaixo);
        const comissaoAcima = shopeeCommissionFee(precoAcima);
        const diferenca = comissaoAcima - comissaoAbaixo;
        if (precoVenda >= limite) {
          alertaFaixa = `Seu preço (${precoVenda.toFixed(2)}) está a ${distancia.toFixed(2)} de cair pra faixa anterior (abaixo de ${limite.toFixed(2)}). Ali a comissão seria ${fmt(comissaoAbaixo)} em vez de ${fmt(comissaoAcima)} — ${diferenca > 0 ? `${fmt(diferenca)} a menos de taxa` : "sem diferença relevante"} se ajustar o preço pra baixo dessa linha.`;
        } else {
          alertaFaixa = `Cuidado: seu preço (${precoVenda.toFixed(2)}) está a só ${distancia.toFixed(2)} de cruzar pra próxima faixa (${limite.toFixed(2)}+). Cruzando, a comissão pula de ${fmt(comissaoAbaixo)} para ${fmt(comissaoAcima)} (${fmt(diferenca)} a mais), mesmo vendendo por quase o mesmo preço.`;
        }
        break;
      }
    }

    return {
      valid: true as const,
      modo,
      custoTotal,
      precoVenda,
      comissaoShopee,
      cpfExtra,
      bracketAtual,
      alertaFaixa,
      taxasValor,
      lucroBruto,
      adsValor,
      lucroLiquido,
      margemBruta,
      margemLiquida,
    };
  })();

  const renderPieTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const pctOfTotal = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0;
    const dTax = d.revenue * tax;
    const dComm = d.revenue * 0.20;
    const dProfit = d.revenue - d.cost - dTax - dComm - (d.adsCost || 0) - (d.freight || 0) - (d.packaging || 0);
    const dMargin = d.revenue > 0 ? (dProfit / d.revenue) * 100 : 0;
    return (
      <div className="pie-tooltip">
        <strong>{d.name}</strong>
        <span>{fmt(d.revenue)} · {pctOfTotal.toFixed(1)}% da receita</span>
        <span>{d.qty} unidade{d.qty === 1 ? "" : "s"} vendida{d.qty === 1 ? "" : "s"}</span>
        <span>Custo: {fmt(d.cost)}{!d.hasCost && " (estimado)"}</span>
        <span>Ads (rateado): {fmt(d.adsCost || 0)}</span>
        <span>Frete (rateado): {fmt(d.freight || 0)}</span>
        <span>Embalagem: {fmt(d.packaging || 0)}</span>
        <span className={dMargin >= 0 ? "text-success" : "text-danger"}>Margem: {dMargin.toFixed(1)}%</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="shopee-loading">
        <div className="shopee-spinner" />
        <p>Carregando...</p>
      </div>
    );
  }

  const DraggableBox = ({ id, children }: { id: string; children: ReactNode }) => {
    const span = overviewSpans[id] || 4;
    return (
      <div
        className={[
          "draggable-box",
          draggedKey === id ? "draggable-box--dragging" : "",
          dragOverKey === id && draggedKey !== id ? "draggable-box--over" : "",
        ].filter(Boolean).join(" ")}
        style={{ gridColumn: `span ${span}` }}
        draggable
        onDragStart={() => setDraggedKey(id)}
        onDragEnd={() => { setDraggedKey(null); setDragOverKey(null); }}
        onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== id) setDragOverKey(id); }}
        onDrop={(e) => { e.preventDefault(); handleBoxDrop(id); }}
      >
        <div className="draggable-box__handle">
          <span className="draggable-box__grip" title="Arraste para reposicionar">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <circle cx="8" cy="5" r="1.6" /><circle cx="16" cy="5" r="1.6" />
              <circle cx="8" cy="12" r="1.6" /><circle cx="16" cy="12" r="1.6" />
              <circle cx="8" cy="19" r="1.6" /><circle cx="16" cy="19" r="1.6" />
            </svg>
          </span>
          <span className="draggable-box__spans" title="Largura da caixa (em colunas de 4)">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                className={`draggable-box__span-btn ${span === n ? "draggable-box__span-btn--active" : ""}`}
                onClick={() => handleSetSpan(id, n)}
              >
                {n}
              </button>
            ))}
          </span>
        </div>
        {children}
      </div>
    );
  };

  const overviewSections: Record<string, ReactNode> = {
    pizza: productSalesArr.length > 0 && (
      <div className="overview-section">
        <h3>Vendas por Produto</h3>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="revenue"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={110}
              label={(entry: any) => `${totalRevenue > 0 ? ((entry.revenue / totalRevenue) * 100).toFixed(0) : 0}%`}
              labelLine={false}
            >
              {pieData.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip content={renderPieTooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    ),
    summary: (
      <div className="overview-summary-box">
        <div className="overview-cards">
          <div className="ov-card ov-card--revenue">
            <span className="ov-card__label">Faturamento</span>
            <span className="ov-card__value">{fmt(totalRevenue)}</span>
            <span className="ov-card__sub">{filteredOrders.length} pedidos</span>
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
          <div className="ov-card ov-card--commission">
            <span className="ov-card__label">Investido em Ads</span>
            <span className="ov-card__value">{fmt(adsExpense)}</span>
            <span className="ov-card__sub">{pct(adsExpense).toFixed(1)}% da receita · já descontado do lucro</span>
          </div>
          <div className="ov-card ov-card--ticket">
            <span className="ov-card__label">TACOS</span>
            <span className="ov-card__value">{totalRevenue > 0 ? `${((adsExpense / totalRevenue) * 100).toFixed(1)}%` : "—"}</span>
            <span className="ov-card__sub">Ads ÷ Faturamento — quanto da receita virou anúncio</span>
          </div>
          <div className="ov-card ov-card--cost">
            <span className="ov-card__label">Embalagem</span>
            <span className="ov-card__value">{fmt(totalPackaging)}</span>
            <span className="ov-card__sub">Cadastrada por produto na aba Produtos</span>
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
      </div>
    ),
    daily: (
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
              const dpct = maxRev > 0 ? (d.revenue / maxRev) * 100 : 0;
              return (
                <div key={d.date} className="daily-bar" title={`${d.date}: ${fmt(d.revenue)} (${d.orders} pedidos)`}>
                  <div className="daily-bar__fill" style={{ height: `${Math.max(dpct, 5)}%` }} />
                  <span className="daily-bar__label">{d.date.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
    ranking: (
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
                <th>Ads</th>
                <th>Frete</th>
                <th>Embalagem</th>
                <th>Lucro</th>
                <th>Margem</th>
              </tr>
            </thead>
            <tbody>
              {productSalesArr.slice(0, 20).map((p, i) => {
                const pTax = p.revenue * tax;
                const pComm = p.revenue * 0.20;
                const pProfit = p.revenue - p.cost - pTax - pComm - p.adsCost - p.freight - p.packaging;
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
                    <td className="text-danger">{fmt(p.adsCost)}</td>
                    <td className="text-danger">{fmt(p.freight)}</td>
                    <td className="text-danger">{fmt(p.packaging)}</td>
                    <td className={pProfit >= 0 ? "text-success" : "text-danger"}>{fmt(pProfit)}</td>
                    <td className={pMargin >= 0 ? "text-success" : "text-danger"}>{pMargin.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    ),
    detailed: (
      <div className="overview-section">
        <h3>Vendas Detalhadas</h3>
        {loadingData ? (
          <div className="shopee-spinner-sm" />
        ) : saleLines.length === 0 ? (
          <p className="text-muted">Nenhuma venda no período selecionado.</p>
        ) : (
          <>
            <table className="shopee-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Pedido</th>
                  <th>Produto</th>
                  <th>Qtd</th>
                  <th>Preço Unit.</th>
                  <th>Receita</th>
                  <th>Custo</th>
                  <th>Imposto</th>
                  <th>Comissão</th>
                  <th>Ads</th>
                  <th>Frete</th>
                  <th>Embalagem</th>
                  <th>Lucro</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {saleLines.slice(0, 50).map((s, i) => (
                  <tr key={`${s.orderSn}-${i}`}>
                    <td>{new Date(s.date * 1000).toLocaleDateString("pt-BR", { timeZone: BR_TIMEZONE })}</td>
                    <td className="order-sn">{s.orderSn}</td>
                    <td className="product-name">{s.name}</td>
                    <td>{s.qty}</td>
                    <td>{fmt(s.unitPrice)}</td>
                    <td>{fmt(s.subtotal)}</td>
                    <td>
                      {fmt(s.cost)}
                      {!s.hasCost && <span className="badge badge--gray cost-badge">estimado</span>}
                    </td>
                    <td className="text-danger">{fmt(s.tax)}</td>
                    <td className="text-danger">{fmt(s.commission)}</td>
                    <td className="text-danger">{fmt(s.ads)}</td>
                    <td className="text-danger">{fmt(s.freight)}</td>
                    <td className="text-danger">{fmt(s.packaging)}</td>
                    <td className={s.profit >= 0 ? "text-success" : "text-danger"}>{fmt(s.profit)}</td>
                    <td className={s.margin >= 0 ? "text-success" : "text-danger"}>{s.margin.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {saleLines.length > 50 && (
              <p className="text-muted" style={{ marginTop: 8 }}>
                Mostrando as 50 vendas mais recentes de {saleLines.length} no período.
              </p>
            )}
          </>
        )}
      </div>
    ),
  };

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
        <button className={`shopee-tab ${activeTab === "calculator" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("calculator")}>
          Calculadora
        </button>
        <button className={`shopee-tab ${activeTab === "config" ? "shopee-tab--active" : ""}`} onClick={() => setActiveTab("config")}>
          Configuração
        </button>
      </div>

      {/* Filtro de período (geral, vale para todas as abas) */}
      {status?.connected && (
        <div className="shopee-period">
          <button className={`period-btn ${period === "today" ? "period-btn--active" : ""}`} onClick={() => setPeriod("today")}>Hoje</button>
          <button className={`period-btn ${period === "yesterday" ? "period-btn--active" : ""}`} onClick={() => setPeriod("yesterday")}>Ontem</button>
          <button className={`period-btn ${period === "week" ? "period-btn--active" : ""}`} onClick={() => setPeriod("week")}>Semana</button>
          <button className={`period-btn ${period === "month" ? "period-btn--active" : ""}`} onClick={() => setPeriod("month")}>Mês</button>
          <button className={`period-btn ${period === "custom" ? "period-btn--active" : ""}`} onClick={() => setPeriod("custom")}>Período</button>
          {isRefreshing && (
            <span className="period-loading-badge">
              <span className="period-loading-badge__spinner" />
              Carregando dados do período... {loadingProgress}%
              <span className="period-loading-badge__bar">
                <span className="period-loading-badge__bar-fill" style={{ width: `${loadingProgress}%` }} />
              </span>
            </span>
          )}
          {period === "custom" && (
            <div className="period-custom">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
              <span>até</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          )}
          {(activeTab === "overview" || activeTab === "dashboard" || activeTab === "orders" || activeTab === "products") && (
            <button
              className="btn-refresh"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Recarregar dados do período selecionado"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" className={isRefreshing ? "btn-refresh__icon spinning" : "btn-refresh__icon"}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                <polyline points="21 3 21 9 15 9" />
              </svg>
              {isRefreshing ? "Atualizando..." : "Atualizar"}
            </button>
          )}
        </div>
      )}

      {status?.connected && (activeTab === "overview" || activeTab === "dashboard" || activeTab === "orders") && (
        <div className="shopee-status-filter">
          <span className="shopee-status-filter__label">Pedidos:</span>
          <button className={`status-filter-btn ${orderStatusFilter === "paid" ? "status-filter-btn--active" : ""}`} onClick={() => setOrderStatusFilter("paid")}>
            Efetivados
          </button>
          <button className={`status-filter-btn ${orderStatusFilter === "all" ? "status-filter-btn--active" : ""}`} onClick={() => setOrderStatusFilter("all")}>
            Todos ({orders.length})
          </button>
          <button className={`status-filter-btn ${orderStatusFilter === "unpaid" ? "status-filter-btn--active" : ""}`} onClick={() => setOrderStatusFilter("unpaid")}>
            Não Pagos ({unpaidCount})
          </button>
          <button className={`status-filter-btn ${orderStatusFilter === "cancelled" ? "status-filter-btn--active" : ""}`} onClick={() => setOrderStatusFilter("cancelled")}>
            Cancelados ({cancelledCount})
          </button>
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
          ) : loadingData ? (
            <div className="content-loading-block">
              <div className="content-loading-block__spinner" />
              <p>Carregando dados do período... {loadingProgress}%</p>
            </div>
          ) : (
            <>
              {(overviewOrder.length !== DEFAULT_OVERVIEW_ORDER.length ||
                !DEFAULT_OVERVIEW_ORDER.every((k, i) => overviewOrder[i] === k) ||
                Object.keys(DEFAULT_OVERVIEW_SPANS).some((k) => overviewSpans[k] !== DEFAULT_OVERVIEW_SPANS[k])) && (
                <button
                  className="btn-reset-layout"
                  onClick={() => { setOverviewOrder(DEFAULT_OVERVIEW_ORDER); setOverviewSpans(DEFAULT_OVERVIEW_SPANS); }}
                >
                  Restaurar layout padrão
                </button>
              )}

              <div className="overview-grid">
                {overviewOrder.map((key) => {
                  const content = overviewSections[key];
                  if (!content) return null;
                  return (
                    <DraggableBox key={key} id={key}>
                      {content}
                    </DraggableBox>
                  );
                })}
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
            <div className="content-loading-block">
              <div className="content-loading-block__spinner" />
              <p>Carregando dados do período... {loadingProgress}%</p>
            </div>
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
                  <span className="ov-card__value">{filteredOrders.length}</span>
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
                            style={{ width: `${filteredOrders.length > 0 ? (count / filteredOrders.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="status-row__count">
                          {count} ({filteredOrders.length > 0 ? ((count / filteredOrders.length) * 100).toFixed(0) : 0}%)
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
                  <th></th>
                  <th>ID</th>
                  <th>Produto</th>
                  <th>Status</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Custo</th>
                  <th>Frete</th>
                  <th>Embalagem</th>
                  <th>Imposto</th>
                  <th>Comissão</th>
                  <th>Lucro</th>
                  <th>Margem</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const key = String(p.item_id);
                  const hasModel = !!p.has_model;
                  const price = p.price_info?.[0]?.current_price || p.price_info?.[0]?.original_price || 0;
                  const draft = costDrafts[key] ?? (costs[key] !== undefined ? String(costs[key]) : "");
                  const freightDraft = freightDrafts[key] ?? (freightOverrides[key] !== undefined ? String(freightOverrides[key]) : "");
                  const packagingDraft = packagingDrafts[key] ?? (packagingCosts[key] !== undefined ? String(packagingCosts[key]) : "");
                  const costValue = costs[key];
                  const freightValue = freightOverrides[key] ?? 0;
                  const packagingValue = packagingCosts[key] ?? 0;
                  const priceTax = price * tax;
                  const priceComm = price * 0.20;
                  const priceProfit = costValue !== undefined ? price - costValue - priceTax - priceComm - freightValue - packagingValue : null;
                  const priceMargin = priceProfit !== null && price > 0 ? (priceProfit / price) * 100 : null;
                  const isExpanded = expandedProducts.has(key);
                  const models = productModels[key] || [];
                  return (
                    <Fragment key={p.item_id}>
                      <tr>
                        <td>
                          {hasModel && (
                            <button
                              type="button"
                              className="expand-toggle"
                              onClick={() => handleToggleExpand(p.item_id)}
                              title={isExpanded ? "Ocultar variações" : "Ver variações"}
                            >
                              {isExpanded ? "−" : "+"}
                            </button>
                          )}
                        </td>
                        <td>{p.item_id}</td>
                        <td className="product-name">{p.item_name}</td>
                        <td>
                          <span className={`badge ${p.item_status === "NORMAL" ? "badge--green" : "badge--gray"}`}>
                            {p.item_status}
                          </span>
                        </td>
                        {hasModel ? (
                          <>
                            <td className="text-muted">Várias variações</td>
                            <td>{p.stock_info_v2?.summary_info?.total_available_stock ?? "—"}</td>
                            <td className="text-muted">Ver variações</td>
                            <td className="text-muted">—</td>
                            <td className="text-muted">—</td>
                            <td className="text-muted">—</td>
                            <td className="text-muted">—</td>
                            <td className="text-muted">—</td>
                            <td className="text-muted">—</td>
                          </>
                        ) : (
                          <>
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
                            <td>
                              <input
                                type="number"
                                className="cost-input"
                                min="0"
                                step="0.01"
                                placeholder="auto"
                                value={freightDraft}
                                onChange={(e) => setFreightDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                                onBlur={(e) => { if (e.target.value !== "") handleSaveExtraCost("freight", key, e.target.value); }}
                              />
                              {savingCostId === `freight:${key}` && <span className="cost-input__saving">salvando...</span>}
                            </td>
                            <td>
                              <input
                                type="number"
                                className="cost-input"
                                min="0"
                                step="0.01"
                                placeholder="0,00"
                                value={packagingDraft}
                                onChange={(e) => setPackagingDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                                onBlur={(e) => { if (e.target.value !== "") handleSaveExtraCost("packaging", key, e.target.value); }}
                              />
                              {savingCostId === `packaging:${key}` && <span className="cost-input__saving">salvando...</span>}
                            </td>
                            <td className="text-danger">{price ? fmt(priceTax) : "—"}</td>
                            <td className="text-danger">{price ? fmt(priceComm) : "—"}</td>
                            <td className={priceProfit === null ? "text-muted" : priceProfit >= 0 ? "text-success" : "text-danger"}>
                              {priceProfit === null ? "—" : fmt(priceProfit)}
                            </td>
                            <td className={priceMargin === null ? "text-muted" : priceMargin >= 0 ? "text-success" : "text-danger"}>
                              {priceMargin === null ? "—" : `${priceMargin.toFixed(1)}%`}
                            </td>
                          </>
                        )}
                      </tr>
                      {hasModel && isExpanded && (
                        <tr key={`${p.item_id}-models`}>
                          <td colSpan={13} className="variation-cell">
                            {loadingModels.has(key) ? (
                              <div className="shopee-spinner-sm" />
                            ) : models.length === 0 ? (
                              <p className="text-muted">Nenhuma variação encontrada.</p>
                            ) : (
                              <table className="shopee-table variation-table">
                                <thead>
                                  <tr>
                                    <th>Variação</th>
                                    <th>Preço</th>
                                    <th>Estoque</th>
                                    <th>Custo</th>
                                    <th>Frete</th>
                                    <th>Embalagem</th>
                                    <th>Imposto</th>
                                    <th>Comissão</th>
                                    <th>Lucro</th>
                                    <th>Margem</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {models.map((m) => {
                                    const mKey = `${p.item_id}:${m.model_id}`;
                                    const mPrice = m.price_info?.[0]?.current_price || m.price_info?.[0]?.original_price || 0;
                                    const mDraft = costDrafts[mKey] ?? (costs[mKey] !== undefined ? String(costs[mKey]) : "");
                                    const mFreightDraft = freightDrafts[mKey] ?? (freightOverrides[mKey] !== undefined ? String(freightOverrides[mKey]) : "");
                                    const mPackagingDraft = packagingDrafts[mKey] ?? (packagingCosts[mKey] !== undefined ? String(packagingCosts[mKey]) : "");
                                    const mCostValue = costs[mKey];
                                    const mFreightValue = freightOverrides[mKey] ?? 0;
                                    const mPackagingValue = packagingCosts[mKey] ?? 0;
                                    const mTax = mPrice * tax;
                                    const mComm = mPrice * 0.20;
                                    const mProfit = mCostValue !== undefined ? mPrice - mCostValue - mTax - mComm - mFreightValue - mPackagingValue : null;
                                    const mMargin = mProfit !== null && mPrice > 0 ? (mProfit / mPrice) * 100 : null;
                                    return (
                                      <tr key={m.model_id}>
                                        <td className="product-name">{m.model_name}</td>
                                        <td>{mPrice ? fmt(mPrice) : "—"}</td>
                                        <td>{m.stock_info_v2?.summary_info?.total_available_stock ?? "—"}</td>
                                        <td>
                                          <input
                                            type="number"
                                            className="cost-input"
                                            min="0"
                                            step="0.01"
                                            placeholder="0,00"
                                            value={mDraft}
                                            onChange={(e) => setCostDrafts((prev) => ({ ...prev, [mKey]: e.target.value }))}
                                            onBlur={(e) => { if (e.target.value !== "") handleSaveCost(mKey, e.target.value); }}
                                          />
                                          {savingCostId === mKey && <span className="cost-input__saving">salvando...</span>}
                                        </td>
                                        <td>
                                          <input
                                            type="number"
                                            className="cost-input"
                                            min="0"
                                            step="0.01"
                                            placeholder="auto"
                                            value={mFreightDraft}
                                            onChange={(e) => setFreightDrafts((prev) => ({ ...prev, [mKey]: e.target.value }))}
                                            onBlur={(e) => { if (e.target.value !== "") handleSaveExtraCost("freight", mKey, e.target.value); }}
                                          />
                                          {savingCostId === `freight:${mKey}` && <span className="cost-input__saving">salvando...</span>}
                                        </td>
                                        <td>
                                          <input
                                            type="number"
                                            className="cost-input"
                                            min="0"
                                            step="0.01"
                                            placeholder="0,00"
                                            value={mPackagingDraft}
                                            onChange={(e) => setPackagingDrafts((prev) => ({ ...prev, [mKey]: e.target.value }))}
                                            onBlur={(e) => { if (e.target.value !== "") handleSaveExtraCost("packaging", mKey, e.target.value); }}
                                          />
                                          {savingCostId === `packaging:${mKey}` && <span className="cost-input__saving">salvando...</span>}
                                        </td>
                                        <td className="text-danger">{mPrice ? fmt(mTax) : "—"}</td>
                                        <td className="text-danger">{mPrice ? fmt(mComm) : "—"}</td>
                                        <td className={mProfit === null ? "text-muted" : mProfit >= 0 ? "text-success" : "text-danger"}>
                                          {mProfit === null ? "—" : fmt(mProfit)}
                                        </td>
                                        <td className={mMargin === null ? "text-muted" : mMargin >= 0 ? "text-success" : "text-danger"}>
                                          {mMargin === null ? "—" : `${mMargin.toFixed(1)}%`}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {products.length === 0 && (
                  <tr><td colSpan={13} className="text-center text-muted">Nenhum produto encontrado</td></tr>
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
            <div className="content-loading-block">
              <div className="content-loading-block__spinner" />
              <p>Carregando dados do período... {loadingProgress}%</p>
            </div>
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
                {filteredOrders.map((o) => (
                  <tr key={o.order_sn}>
                    <td className="order-sn">{o.order_sn}</td>
                    <td>{new Date((o.pay_time || o.create_time) * 1000).toLocaleDateString("pt-BR", { timeZone: BR_TIMEZONE })}</td>
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
                {filteredOrders.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted">Nenhum pedido no período</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* CALCULADORA */}
      {activeTab === "calculator" && (
        <div className="shopee-calculator">
          <div className="config-card">
            <h3>Calculadora de Preço e Margem</h3>
            <p className="text-muted">Calcule o preço de venda ideal a partir da margem desejada, ou informe um valor de venda manual pra ver a margem resultante. Taxas ficam todas editáveis — ajuste conforme seu enquadramento.</p>

            <div className="calc-toggle">
              <button
                type="button"
                className={`calc-toggle__btn ${calcBusinessType === "cnpj" ? "calc-toggle__btn--active" : ""}`}
                onClick={() => setCalcBusinessType("cnpj")}
              >
                🏢 CNPJ
              </button>
              <button
                type="button"
                className={`calc-toggle__btn ${calcBusinessType === "cpf" ? "calc-toggle__btn--active" : ""}`}
                onClick={() => setCalcBusinessType("cpf")}
              >
                👤 CPF
              </button>
            </div>

            <div className="calc-grid">
              <div className="form-group">
                <label>Custo do Produto (R$)</label>
                <input type="text" inputMode="decimal" placeholder="0,00" value={calcProductCost} onChange={(e) => setCalcProductCost(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Custos Adicionais (R$)</label>
                <input type="text" inputMode="decimal" placeholder="0,00" value={calcAdditionalCosts} onChange={(e) => setCalcAdditionalCosts(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Shopee Antecipa (%)</label>
                <input type="text" inputMode="decimal" placeholder="0" value={calcShopeeAdvance} onChange={(e) => setCalcShopeeAdvance(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Imposto sobre Venda (%)</label>
                <input type="text" inputMode="decimal" placeholder="0" value={calcSalesTax} onChange={(e) => setCalcSalesTax(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Margem de Lucro desejada (%)</label>
                <input type="text" inputMode="decimal" placeholder="0" value={calcProfitMargin} onChange={(e) => setCalcProfitMargin(e.target.value)} disabled={!!calcManualSaleValue} />
              </div>
              <div className="form-group">
                <label>Valor de Venda (manual, opcional)</label>
                <input type="text" inputMode="decimal" placeholder="R$ 0,00" value={calcManualSaleValue} onChange={(e) => setCalcManualSaleValue(e.target.value)} />
              </div>
              <div className="form-group calc-checkbox">
                <label>
                  <input type="checkbox" checked={calcFeaturedCampaigns} onChange={(e) => setCalcFeaturedCampaigns(e.target.checked)} />
                  Campanhas de Destaque (+2,5%)
                </label>
              </div>
              <div className="form-group">
                <label>% investida do lucro em ads (ROAS ativo)</label>
                <input type="text" inputMode="decimal" placeholder="0" value={calcAdsPercent} onChange={(e) => setCalcAdsPercent(e.target.value)} />
              </div>
              <div className="form-group calc-checkbox">
                <label>
                  <input type="checkbox" checked={calcAffiliateEnabled} onChange={(e) => setCalcAffiliateEnabled(e.target.checked)} />
                  Comissão de Afiliado
                </label>
              </div>
              <div className="form-group">
                <label>Comissão de Afiliado (%)</label>
                <input type="text" inputMode="decimal" placeholder="1" value={calcAffiliatePercent} onChange={(e) => setCalcAffiliatePercent(e.target.value)} disabled={!calcAffiliateEnabled} />
              </div>
            </div>

            <p className="text-muted" style={{ marginTop: 12, fontSize: 13 }}>
              💡 A comissão da Shopee usada aqui segue a tabela por faixa de preço (não é mais um % fixo): até R$79,99 → 20%+R$4; R$80–99,99 → 14%+R$16; R$100–199,99 → 14%+R$20; a partir de R$200 → 14%+R$26.
              {calcBusinessType === "cpf" && " Vendedor pessoa física (CPF) tem uma taxa fixa adicional de R$3 por item."}
              {" "}Desconto no Pix pro comprador é bancado pela própria Shopee, não sai do seu repasse — por isso não entra como custo aqui.
              {" "}Valores de fonte pública (não é a documentação oficial da Shopee) — confira no seu extrato de repasse se bate.
            </p>

            {!calc.valid ? (
              <p className="cost-warning" style={{ marginTop: 20 }}>{calc.reason}</p>
            ) : (
              <>
                {calc.alertaFaixa && (
                  <p className="cost-warning" style={{ marginTop: 20, background: "#fff8e1", borderColor: "#f0c419" }}>
                    ⚠️ {calc.alertaFaixa}
                  </p>
                )}
                <div className="calc-results">
                  <div className="ov-card ov-card--revenue">
                    <span className="ov-card__label">{calc.modo === "reverso" ? "Valor de Venda (informado)" : "Preço de Venda Sugerido"}</span>
                    <span className="ov-card__value">{fmt(calc.precoVenda)}</span>
                    <span className="ov-card__sub">
                      Faixa: {calc.bracketAtual.max === Infinity ? `a partir de ${fmt(calc.bracketAtual.min)}` : `${fmt(calc.bracketAtual.min)} – ${fmt(calc.bracketAtual.max)}`} ({(calc.bracketAtual.rate * 100).toFixed(0)}% + {fmt(calc.bracketAtual.fixed)})
                    </span>
                  </div>
                  <div className="ov-card ov-card--tax">
                    <span className="ov-card__label">Comissão Shopee (faixa)</span>
                    <span className="ov-card__value">{fmt(calc.comissaoShopee)}</span>
                  </div>
                  {calc.cpfExtra > 0 && (
                    <div className="ov-card ov-card--tax">
                      <span className="ov-card__label">Taxa fixa CPF</span>
                      <span className="ov-card__value">{fmt(calc.cpfExtra)}</span>
                    </div>
                  )}
                  <div className="ov-card ov-card--tax">
                    <span className="ov-card__label">Taxas totais (Shopee + CPF + Imposto + Campanhas + Afiliado)</span>
                    <span className="ov-card__value">{fmt(calc.taxasValor)}</span>
                  </div>
                  <div className="ov-card ov-card--commission">
                    <span className="ov-card__label">Investimento em Ads</span>
                    <span className="ov-card__value">{fmt(calc.adsValor)}</span>
                  </div>
                  <div className="ov-card ov-card--profit">
                    <span className="ov-card__label">Lucro Bruto</span>
                    <span className="ov-card__value">{fmt(calc.lucroBruto)}</span>
                    <span className="ov-card__sub">Margem bruta: {calc.margemBruta.toFixed(1)}%</span>
                  </div>
                  <div className={`ov-card ${calc.lucroLiquido >= 0 ? "ov-card--profit" : "ov-card--loss"}`}>
                    <span className="ov-card__label">Lucro Líquido (após ads)</span>
                    <span className="ov-card__value">{fmt(calc.lucroLiquido)}</span>
                    <span className="ov-card__sub">Margem líquida: {calc.margemLiquida.toFixed(1)}%</span>
                  </div>
                </div>
              </>
            )}
          </div>
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
                  placeholder={status?.hasCredentials ? "Deixe em branco para manter a chave atual" : "Chave secreta do app"}
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
                {status?.hasCredentials && (
                  <button className="btn btn--success" onClick={handleConnect}>
                    {status?.connected ? "Reconectar Loja Shopee" : "Conectar Loja Shopee"}
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
