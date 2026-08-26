import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const ADMIN_ROLES = ["sysadmin", "admin"];

async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return null;
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  return null;
}

const CONFIG_PATH = "/app/shopee-config.json";
const COSTS_PATH = "/app/shopee-costs.json";

function getCosts(): Record<string, number> {
  try {
    const raw = fs.readFileSync(COSTS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveCosts(costs: Record<string, number>) {
  fs.writeFileSync(COSTS_PATH, JSON.stringify(costs, null, 2));
}

interface ShopeeConfig {
  partnerId: number;
  partnerKey: string;
  shopId: number;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  baseUrl: string;
  taxRate: number;
  connected: boolean;
}

function getConfig(): ShopeeConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {
      partnerId: 0,
      partnerKey: "",
      shopId: 0,
      accessToken: "",
      refreshToken: "",
      tokenExpiry: 0,
      baseUrl: "https://openplatform.shopee.com.br",
      taxRate: 12,
      connected: false,
    };
  }
}

function saveConfig(config: ShopeeConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function generateSign(
  partnerId: number,
  partnerKey: string,
  apiPath: string,
  timestamp: number,
  accessToken?: string,
  shopId?: number
): string {
  let baseString = `${partnerId}${apiPath}${timestamp}`;
  if (accessToken) baseString += accessToken;
  if (shopId) baseString += shopId;
  return crypto
    .createHmac("sha256", partnerKey)
    .update(baseString)
    .digest("hex");
}

async function shopeeRequest(
  config: ShopeeConfig,
  apiPath: string,
  params: Record<string, any> = {},
  method: "GET" | "POST" = "GET",
  body?: any
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(
    config.partnerId,
    config.partnerKey,
    apiPath,
    timestamp,
    config.accessToken,
    config.shopId
  );

  const queryParams = new URLSearchParams({
    partner_id: String(config.partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: config.accessToken,
    shop_id: String(config.shopId),
    ...params,
  });

  const url = `${config.baseUrl}${apiPath}?${queryParams.toString()}`;

  const options: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (method === "POST" && body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  return res.json();
}

async function refreshAccessToken(config: ShopeeConfig): Promise<ShopeeConfig> {
  const apiPath = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = generateSign(
    config.partnerId,
    config.partnerKey,
    apiPath,
    timestamp
  );

  const url = `${config.baseUrl}${apiPath}?partner_id=${config.partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      partner_id: config.partnerId,
      shop_id: config.shopId,
      refresh_token: config.refreshToken,
    }),
  });

  const data = await res.json();
  if (data.access_token) {
    config.accessToken = data.access_token;
    config.refreshToken = data.refresh_token;
    config.tokenExpiry = Date.now() + 4 * 60 * 60 * 1000; // 4h
    saveConfig(config);
  }
  return config;
}

async function ensureValidToken(config: ShopeeConfig): Promise<ShopeeConfig> {
  if (Date.now() > config.tokenExpiry - 300000) {
    // Refresh 5min antes de expirar
    return refreshAccessToken(config);
  }
  return config;
}

// A Shopee limita get_order_list/get_escrow_list a uma janela de no máximo 15 dias
// por chamada — por isso quebramos períodos maiores (ex: "mês") em sub-janelas.
const MAX_TIME_WINDOW = 15 * 24 * 3600;
const MAX_PAGES = 40; // trava de segurança contra lojas com volume muito alto

async function fetchAllOrderSns(
  config: ShopeeConfig,
  timeFrom: number,
  timeTo: number,
  status: string | null
): Promise<string[]> {
  const orderSns: string[] = [];
  let windowStart = timeFrom;
  let pages = 0;

  while (windowStart < timeTo && pages < MAX_PAGES) {
    const windowEnd = Math.min(windowStart + MAX_TIME_WINDOW, timeTo);
    let cursor = "";
    do {
      const params: Record<string, string> = {
        time_range_field: "create_time",
        time_from: String(windowStart),
        time_to: String(windowEnd),
        page_size: "100",
      };
      // A Shopee não aceita "ALL" como order_status — omitir o parâmetro
      // é o jeito de trazer pedidos de todos os status.
      if (status && status !== "ALL") params.order_status = status;
      if (cursor) params.cursor = cursor;

      const data = await shopeeRequest(config, "/api/v2/order/get_order_list", params);
      const list = data.response?.order_list || [];
      orderSns.push(...list.map((o: any) => o.order_sn));
      cursor = data.response?.more ? (data.response?.next_cursor || "") : "";
      pages++;
    } while (cursor && pages < MAX_PAGES);

    windowStart = windowEnd;
  }

  return orderSns;
}

async function fetchAllEscrowList(
  config: ShopeeConfig,
  timeFrom: number,
  timeTo: number
): Promise<any[]> {
  const escrowList: any[] = [];
  let windowStart = timeFrom;
  let pages = 0;

  while (windowStart < timeTo && pages < MAX_PAGES) {
    const windowEnd = Math.min(windowStart + MAX_TIME_WINDOW, timeTo);
    let pageNo = 1;
    let hasMore = true;
    while (hasMore && pages < MAX_PAGES) {
      const data = await shopeeRequest(config, "/api/v2/payment/get_escrow_list", {
        release_time_from: String(windowStart),
        release_time_to: String(windowEnd),
        page_size: "100",
        page_no: String(pageNo),
      });
      const list = data.response?.escrow_list || [];
      escrowList.push(...list);
      hasMore = list.length === 100;
      pageNo++;
      pages++;
    }
    windowStart = windowEnd;
  }

  return escrowList;
}

// get_all_cpc_ads_daily_performance exige data em DD-MM-YYYY (fuso de
// Brasília) e não aceita janela maior que 1 mês por chamada.
const ADS_MAX_WINDOW = 29 * 24 * 3600;

function toBrDateStr(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const year = parts.find((p) => p.type === "year")?.value;
  return `${day}-${month}-${year}`;
}

async function fetchAllAdsPerformance(
  config: ShopeeConfig,
  timeFrom: number,
  timeTo: number
): Promise<any[]> {
  const days: any[] = [];
  let windowStart = timeFrom;
  let iterations = 0;

  while (windowStart < timeTo && iterations < MAX_PAGES) {
    const windowEnd = Math.min(windowStart + ADS_MAX_WINDOW, timeTo);
    const data = await shopeeRequest(config, "/api/v2/ads/get_all_cpc_ads_daily_performance", {
      start_date: toBrDateStr(windowStart),
      end_date: toBrDateStr(windowEnd),
    });
    if (Array.isArray(data.response)) days.push(...data.response);
    windowStart = windowEnd + 86400; // próximo dia, pra não repetir o último dia da janela anterior
    iterations++;
  }

  return days;
}

const CAMPAIGN_BATCH_SIZE = 100;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// Gasto real de Ads por produto: cruza a lista de campanhas "product ads"
// (uma campanha manual = um item_id) com a performance diária de cada uma,
// somando o expense de todas as campanhas que já tiveram esse produto.
async function fetchAdsExpenseByProduct(
  config: ShopeeConfig,
  timeFrom: number,
  timeTo: number
): Promise<Record<string, number>> {
  const expenseByItem: Record<string, number> = {};

  const campaignIds: number[] = [];
  let hasNextPage = true;
  let offset = 0;
  let pages = 0;
  while (hasNextPage && pages < MAX_PAGES) {
    const data = await shopeeRequest(config, "/api/v2/ads/get_product_level_campaign_id_list", {
      ad_type: "all",
      offset: String(offset),
      page_size: "100",
    });
    const list = data.response?.campaign_list || [];
    campaignIds.push(...list.map((c: any) => c.campaign_id));
    hasNextPage = !!data.response?.has_next_page;
    offset += list.length;
    pages++;
    if (list.length === 0) break;
  }
  if (campaignIds.length === 0) return expenseByItem;

  // Mapear campaign_id -> item_id (campanhas manuais de produto = 1 item cada)
  const campaignToItems: Record<number, number[]> = {};
  for (const batch of chunkArray(campaignIds, CAMPAIGN_BATCH_SIZE)) {
    const info = await shopeeRequest(config, "/api/v2/ads/get_product_level_campaign_setting_info", {
      campaign_id_list: batch.join(","),
      info_type_list: "1",
    });
    for (const c of info.response?.campaign_list || []) {
      campaignToItems[c.campaign_id] = c.common_info?.item_id_list || [];
    }
  }

  // Somar o expense de cada campanha no período (respeitando o limite de
  // janela de datas), e distribuir pros item_id(s) daquela campanha.
  for (const batch of chunkArray(campaignIds, CAMPAIGN_BATCH_SIZE)) {
    let windowStart = timeFrom;
    while (windowStart < timeTo) {
      const windowEnd = Math.min(windowStart + ADS_MAX_WINDOW, timeTo);
      const perf = await shopeeRequest(config, "/api/v2/ads/get_product_campaign_daily_performance", {
        start_date: toBrDateStr(windowStart),
        end_date: toBrDateStr(windowEnd),
        campaign_id_list: batch.join(","),
      });
      for (const camp of perf.response?.campaign_list || []) {
        const totalExpense = (camp.metrics_list || []).reduce((s: number, m: any) => s + (m.expense || 0), 0);
        const items = campaignToItems[camp.campaign_id] || [];
        if (items.length === 0 || totalExpense === 0) continue;
        const perItem = totalExpense / items.length;
        for (const itemId of items) {
          expenseByItem[String(itemId)] = (expenseByItem[String(itemId)] || 0) + perItem;
        }
      }
      windowStart = windowEnd + 86400;
    }
  }

  return expenseByItem;
}

export async function GET(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  // Retornar status da conexão
  if (action === "status") {
    const config = getConfig();
    return NextResponse.json({
      connected: config.connected,
      shopId: config.shopId,
      partnerId: config.partnerId,
      taxRate: config.taxRate,
      hasCredentials: !!(config.partnerId && config.partnerKey),
    });
  }

  // Gerar URL de autorização OAuth
  if (action === "auth_url") {
    const config = getConfig();
    if (!config.partnerId || !config.partnerKey) {
      return NextResponse.json(
        { error: "Configure Partner ID e Partner Key primeiro" },
        { status: 400 }
      );
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const redirectUrl = `${process.env.NEXTAUTH_URL}/api/shopee/callback`;
    const apiPath = "/api/v2/shop/auth_partner";
    const sign = generateSign(
      config.partnerId,
      config.partnerKey,
      apiPath,
      timestamp
    );
    const authUrl = `${config.baseUrl}${apiPath}?partner_id=${config.partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUrl)}`;
    return NextResponse.json({ authUrl });
  }

  // Buscar produtos
  if (action === "products") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const data = await shopeeRequest(config, "/api/v2/product/get_item_list", {
      offset: searchParams.get("offset") || "0",
      page_size: searchParams.get("page_size") || "50",
      item_status: "NORMAL",
    });

    if (data.response?.item) {
      // Buscar detalhes de cada item
      const itemIds = data.response.item.map((i: any) => i.item_id).join(",");
      const details = await shopeeRequest(
        config,
        "/api/v2/product/get_item_base_info",
        { item_id_list: itemIds }
      );
      return NextResponse.json({
        products: details.response?.item_list || [],
        total: data.response.total_count || 0,
        hasMore: data.response.has_next_page || false,
      });
    }
    return NextResponse.json({ products: [], total: 0, hasMore: false });
  }

  // Buscar variações (modelos) de um produto
  if (action === "models") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const itemId = searchParams.get("item_id");
    if (!itemId) {
      return NextResponse.json({ error: "item_id obrigatório" }, { status: 400 });
    }

    const data = await shopeeRequest(config, "/api/v2/product/get_model_list", { item_id: itemId });

    return NextResponse.json({
      models: data.response?.model || [],
    });
  }

  // Buscar pedidos
  if (action === "orders") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const timeFrom = Number(searchParams.get("time_from")) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const timeTo = Number(searchParams.get("time_to")) || Math.floor(Date.now() / 1000);
    const status = searchParams.get("status");

    const orderSns = await fetchAllOrderSns(config, timeFrom, timeTo, status);
    if (orderSns.length === 0) {
      return NextResponse.json({ orders: [], total: 0, hasMore: false });
    }

    // get_order_detail aceita no máximo 50 order_sn por chamada
    const orders: any[] = [];
    for (let i = 0; i < orderSns.length; i += 50) {
      const batch = orderSns.slice(i, i + 50);
      const details = await shopeeRequest(config, "/api/v2/order/get_order_detail", {
        order_sn_list: batch.join(","),
        response_optional_fields:
          "buyer_user_id,item_list,pay_time,buyer_username,estimated_shipping_fee,actual_shipping_fee,total_amount,order_chargeable_weight_gram",
      });
      orders.push(...(details.response?.order_list || []));
    }

    return NextResponse.json({ orders, total: orders.length, hasMore: false });
  }

  // Buscar dados financeiros (escrow)
  if (action === "finance") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const releaseTimeFrom = Number(searchParams.get("time_from")) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const releaseTimeTo = Number(searchParams.get("time_to")) || Math.floor(Date.now() / 1000);

    const escrowList = await fetchAllEscrowList(config, releaseTimeFrom, releaseTimeTo);

    return NextResponse.json({
      escrowList,
      total: escrowList.length,
    });
  }

  // Performance de anúncios (gasto real com Ads) no período
  if (action === "ads_performance") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const timeFrom = Number(searchParams.get("time_from")) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const timeTo = Number(searchParams.get("time_to")) || Math.floor(Date.now() / 1000);

    const days = await fetchAllAdsPerformance(config, timeFrom, timeTo);
    const totalExpense = days.reduce((sum, d) => sum + (d.expense || 0), 0);
    const totalDirectGmv = days.reduce((sum, d) => sum + (d.direct_gmv || 0), 0);
    const totalBroadGmv = days.reduce((sum, d) => sum + (d.broad_gmv || 0), 0);

    return NextResponse.json({ days, totalExpense, totalDirectGmv, totalBroadGmv });
  }

  // Gasto real de Ads por produto (não rateado) no período
  if (action === "ads_by_product") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const timeFrom = Number(searchParams.get("time_from")) || Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
    const timeTo = Number(searchParams.get("time_to")) || Math.floor(Date.now() / 1000);

    const expenseByItem = await fetchAdsExpenseByProduct(config, timeFrom, timeTo);

    return NextResponse.json({ expenseByItem });
  }

  // Buscar detalhes financeiros de um pedido
  if (action === "escrow_detail") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const orderSn = searchParams.get("order_sn");
    if (!orderSn) {
      return NextResponse.json({ error: "order_sn obrigatório" }, { status: 400 });
    }

    const data = await shopeeRequest(config, "/api/v2/payment/get_escrow_detail", {
      order_sn: orderSn,
    });

    return NextResponse.json({
      escrow: data.response || null,
    });
  }

  // Custos cadastrados por produto (para cálculo de margem real)
  if (action === "costs") {
    return NextResponse.json({ costs: getCosts() });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await req.json();
  const { action } = body;

  if (action === "save_credentials" || action === "disconnect") {
    const deniedAdmin = await requireAdmin();
    if (deniedAdmin) return deniedAdmin;
  }

  // Salvar custo de um produto
  if (action === "save_cost") {
    const itemId = String(body.itemId || "");
    const cost = Number(body.cost);
    if (!itemId || !Number.isFinite(cost) || cost < 0) {
      return NextResponse.json({ error: "itemId e cost (>= 0) são obrigatórios" }, { status: 400 });
    }
    const costs = getCosts();
    costs[itemId] = cost;
    saveCosts(costs);
    return NextResponse.json({ success: true });
  }

  // Salvar credenciais
  if (action === "save_credentials") {
    const config = getConfig();
    // Campos em branco mantêm o valor já salvo — a Partner Key nunca volta pro
    // formulário (por segurança), então reenviar o formulário sem digitá-la de
    // novo não pode apagar a chave real.
    if (body.partnerId) config.partnerId = Number(body.partnerId) || config.partnerId;
    if (body.partnerKey) config.partnerKey = body.partnerKey;
    if (body.shopId) config.shopId = Number(body.shopId) || config.shopId;
    if (body.baseUrl) config.baseUrl = body.baseUrl;
    if (body.taxRate !== undefined && body.taxRate !== "") config.taxRate = Number(body.taxRate);
    saveConfig(config);
    return NextResponse.json({ success: true });
  }

  // Desconectar
  if (action === "disconnect") {
    const config = getConfig();
    config.accessToken = "";
    config.refreshToken = "";
    config.tokenExpiry = 0;
    config.connected = false;
    saveConfig(config);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
