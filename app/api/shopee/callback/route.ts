import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";

const CONFIG_PATH = "/app/shopee-config.json";

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
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw);
}

function saveConfig(config: ShopeeConfig) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const shopId = searchParams.get("shop_id");

  if (!code || !shopId) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/shopee?error=missing_params`
    );
  }

  const config = getConfig();
  config.shopId = Number(shopId);

  // Trocar code por access_token
  const apiPath = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${config.partnerId}${apiPath}${timestamp}`;
  const sign = crypto
    .createHmac("sha256", config.partnerKey)
    .update(baseString)
    .digest("hex");

  const url = `${config.baseUrl}${apiPath}?partner_id=${config.partnerId}&timestamp=${timestamp}&sign=${sign}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        partner_id: config.partnerId,
        shop_id: Number(shopId),
      }),
    });

    const data = await res.json();

    if (data.access_token) {
      config.accessToken = data.access_token;
      config.refreshToken = data.refresh_token;
      config.tokenExpiry = Date.now() + 4 * 60 * 60 * 1000;
      config.connected = true;
      saveConfig(config);

      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/shopee?connected=true`
      );
    } else {
      return NextResponse.redirect(
        `${process.env.NEXTAUTH_URL}/shopee?error=${encodeURIComponent(data.error || "token_error")}`
      );
    }
  } catch (err: any) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/shopee?error=${encodeURIComponent(err.message)}`
    );
  }
}
