/**
 * Public endpoint: GET  /apps/reviews/reviews?productId=123&page=1
 *                  POST /apps/reviews/reviews   (submit a review)
 *
 * Reached from the storefront through the App Proxy, so the request is signed
 * by Shopify. `shop` comes from the verified signature, never from the body.
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { requireShop, hashIp, json } from "../lib/proxy.server";
import { parseReview, rateLimited, checkVerifiedPurchase } from "../lib/validate.server";
import { recalcProduct, pushRatingMetafields } from "../lib/stats.server";

const PAGE_SIZE = 10;

export async function loader({ request }: LoaderFunctionArgs) {
  const shop = requireShop(request);
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const sort = url.searchParams.get("sort") || "recent";
  const star = Number(url.searchParams.get("star") || 0);

  if (!/^\d+$/.test(productId)) return json({ error: "Invalid product" }, { status: 400 });

  const where = {
    shop,
    productId,
    status: "PUBLISHED" as const,
    ...(star >= 1 && star <= 5 ? { rating: star } : {}),
  };

  const orderBy =
    sort === "helpful" ? { helpfulCount: "desc" as const }
    : sort === "high" ? { rating: "desc" as const }
    : sort === "low" ? { rating: "asc" as const }
    : { createdAt: "desc" as const };

  const [reviews, total, stats] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, rating: true, title: true, body: true, authorName: true,
        verified: true, createdAt: true, reply: true, repliedAt: true,
        helpfulCount: true, images: { select: { url: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.productStats.findUnique({ where: { shop_productId: { shop, productId } } }),
  ]);

  return json({
    reviews: reviews.map((r) => ({
      ...r,
      // Only ever expose a first name publicly.
      authorName: r.authorName.split(" ")[0],
      images: r.images.map((i) => i.url),
    })),
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    stats: stats
      ? {
          average: stats.average, count: stats.count,
          buckets: { 1: stats.star1, 2: stats.star2, 3: stats.star3, 4: stats.star4, 5: stats.star5 },
        }
      : { average: 0, count: 0, buckets: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, { status: 405 });

  const shop = requireShop(request);
  const form = await request.formData();
  const parsed = parseReview(form);
  if (!parsed.ok) return json({ error: parsed.error }, { status: 422 });
  const data = parsed.data;

  const ipHash = hashIp(request);
  if (await rateLimited(shop, ipHash, data.productId)) {
    return json({ error: "You've already reviewed this product." }, { status: 429 });
  }

  const settings = await prisma.shopSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });

  // Offline token for this shop — works outside an admin session.
  const { admin } = await unauthenticated.admin(shop);

  const { verified, orderId } = await checkVerifiedPurchase(admin, data.authorEmail || "", data.productId);
  if (settings.requireVerified && !verified) {
    return json({ error: "Only verified buyers can review this product." }, { status: 403 });
  }

  const status = settings.autoPublish ? "PUBLISHED" : "PENDING";

  const review = await prisma.review.create({
    data: {
      shop,
      productId: data.productId,
      rating: data.rating,
      title: data.title || null,
      body: data.body,
      authorName: data.authorName,
      authorEmail: data.authorEmail || null,
      verified,
      orderId: orderId || null,
      status,
      ipHash,
      images: settings.allowImages
        ? { create: (data.images || []).slice(0, settings.maxImages).map((url) => ({ url })) }
        : undefined,
    },
  });

  if (status === "PUBLISHED") {
    const { average, count } = await recalcProduct(shop, data.productId);
    await pushRatingMetafields(admin, data.productId, average, count);
  }

  return json({
    ok: true,
    id: review.id,
    status,
    message: status === "PUBLISHED" ? "Thanks! Your review is live." : "Thanks! Your review will appear once approved.",
  });
}
