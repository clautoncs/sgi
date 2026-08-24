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

  // Buscar pedidos
  if (action === "orders") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const timeFrom = searchParams.get("time_from") || String(Math.floor(Date.now() / 1000) - 30 * 24 * 3600);
    const timeTo = searchParams.get("time_to") || String(Math.floor(Date.now() / 1000));
    const cursor = searchParams.get("cursor") || "";

    const params: Record<string, string> = {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: "50",
      order_status: searchParams.get("status") || "COMPLETED",
    };
    if (cursor) params.cursor = cursor;

    const data = await shopeeRequest(config, "/api/v2/order/get_order_list", params);

    if (data.response?.order_list?.length) {
      const orderIds = data.response.order_list.map((o: any) => o.order_sn).join(",");
      const details = await shopeeRequest(
        config,
        "/api/v2/order/get_order_detail",
        {
          order_sn_list: orderIds,
          response_optional_fields:
            "buyer_user_id,item_list,pay_time,buyer_username,estimated_shipping_fee,actual_shipping_fee,total_amount,order_chargeable_weight_gram",
        }
      );
      return NextResponse.json({
        orders: details.response?.order_list || [],
        total: data.response.total_count || 0,
        hasMore: data.response.more || false,
        nextCursor: data.response.next_cursor || "",
      });
    }
    return NextResponse.json({ orders: [], total: 0, hasMore: false });
  }

  // Buscar dados financeiros (escrow)
  if (action === "finance") {
    let config = getConfig();
    if (!config.connected) {
      return NextResponse.json({ error: "Shopee não conectada" }, { status: 400 });
    }
    config = await ensureValidToken(config);

    const releaseTimeFrom = searchParams.get("time_from") || String(Math.floor(Date.now() / 1000) - 30 * 24 * 3600);
    const releaseTimeTo = searchParams.get("time_to") || String(Math.floor(Date.now() / 1000));

    const data = await shopeeRequest(config, "/api/v2/payment/get_escrow_list", {
      release_time_from: releaseTimeFrom,
      release_time_to: releaseTimeTo,
      page_size: "50",
      page_no: searchParams.get("page") || "1",
    });

    return NextResponse.json({
      escrowList: data.response?.escrow_list || [],
      total: data.response?.total_count || 0,
    });
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
    config.partnerId = Number(body.partnerId) || 0;
    config.partnerKey = body.partnerKey || "";
    config.shopId = Number(body.shopId) || 0;
    config.baseUrl = body.baseUrl || "https://openplatform.shopee.com.br";
    config.taxRate = Number(body.taxRate) || 12;
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
