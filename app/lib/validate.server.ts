/** Input validation + a small anti-spam gate for public review submissions. */
import prisma from "../db.server";

export type ReviewInput = {
  productId: string;
  rating: number;
  title?: string;
  body: string;
  authorName: string;
  authorEmail?: string;
  images?: string[];
};

export function parseReview(form: FormData): { ok: true; data: ReviewInput } | { ok: false; error: string } {
  const productId = String(form.get("productId") || "").trim();
  const rating = Number(form.get("rating"));
  const body = String(form.get("body") || "").trim();
  const authorName = String(form.get("authorName") || "").trim();
  const authorEmail = String(form.get("authorEmail") || "").trim();
  const title = String(form.get("title") || "").trim();

  // Honeypot: real people leave this hidden field empty.
  if (String(form.get("website") || "").length > 0) return { ok: false, error: "Rejected" };

  if (!/^\d+$/.test(productId)) return { ok: false, error: "Invalid product" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Pick a rating from 1 to 5" };
  if (body.length < 5) return { ok: false, error: "Please write a little more" };
  if (body.length > 5000) return { ok: false, error: "Review is too long" };
  if (authorName.length < 2 || authorName.length > 80) return { ok: false, error: "Please enter your name" };
  if (authorEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(authorEmail)) return { ok: false, error: "Enter a valid email" };
  if (title.length > 120) return { ok: false, error: "Title is too long" };

  const images = String(form.get("images") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https:\/\//.test(s))
    .slice(0, 5);

  return { ok: true, data: { productId, rating, title, body, authorName, authorEmail, images } };
}

/** Max 3 reviews per hashed IP per hour, and one per product per IP per day. */
export async function rateLimited(shop: string, ipHash: string | null, productId: string) {
  if (!ipHash) return false;
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recent, duplicate] = await Promise.all([
    prisma.review.count({ where: { shop, ipHash, createdAt: { gte: hourAgo } } }),
    prisma.review.count({ where: { shop, ipHash, productId, createdAt: { gte: dayAgo } } }),
  ]);

  return recent >= 3 || duplicate > 0;
}

/** Was this email actually sold this product? Marks the review as verified. */
export async function checkVerifiedPurchase(
  admin: { graphql: (q: string, o?: any) => Promise<Response> },
  email: string,
  productId: string,
): Promise<{ verified: boolean; orderId?: string }> {
  if (!email) return { verified: false };

  const query = `#graphql
    query FindOrders($q: String!) {
      orders(first: 20, query: $q) {
        nodes {
          id
          lineItems(first: 50) { nodes { product { id } } }
        }
      }
    }`;

  try {
    const res = await admin.graphql(query, {
      variables: { q: `email:${email} financial_status:paid` },
    });
    const body = await res.json();
    const gid = `gid://shopify/Product/${productId}`;
    for (const order of body?.data?.orders?.nodes || []) {
      const hit = order.lineItems.nodes.some((li: any) => li.product?.id === gid);
      if (hit) return { verified: true, orderId: order.id };
    }
  } catch (e) {
    console.error("verified purchase lookup failed", e);
  }
  return { verified: false };
}
