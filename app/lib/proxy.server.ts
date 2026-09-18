/**
 * App Proxy helpers.
 *
 * Shopify signs every proxied storefront request. Verifying that signature is
 * what makes this safe to expose publicly — without it, anyone could pass
 * ?shop=someone-else.myshopify.com and read another store's data.
 */
import crypto from "crypto";

const SECRET = process.env.SHOPIFY_API_SECRET!;

/** Verify the `signature` param Shopify adds to App Proxy requests. */
export function verifyProxySignature(url: URL): boolean {
  const params = new URLSearchParams(url.search);
  const signature = params.get("signature");
  if (!signature) return false;
  params.delete("signature");

  // Sort keys, join as key=value with no separators — Shopify's proxy scheme.
  const message = [...params.entries()]
    .map(([k, v]) => [k, v] as [string, string])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("");

  const digest = crypto.createHmac("sha256", SECRET).update(message).digest("hex");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Returns the verified shop domain, or throws a 401.
 * Always derive `shop` from here — never from a body field the client controls.
 */
export function requireShop(request: Request): string {
  const url = new URL(request.url);
  if (!verifyProxySignature(url)) {
    throw new Response("Invalid signature", { status: 401 });
  }
  const shop = url.searchParams.get("shop");
  if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
    throw new Response("Missing shop", { status: 400 });
  }
  return shop;
}

/** Hash an IP with a server-side salt. Used for rate limiting; raw IPs are never stored. */
export function hashIp(request: Request): string | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip");
  if (!ip) return null;
  return crypto
    .createHmac("sha256", process.env.IP_SALT || SECRET)
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(init.headers || {}),
    },
  });
}
