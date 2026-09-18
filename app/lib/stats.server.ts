/**
 * Keeps ProductStats in sync and mirrors the rating into Shopify metafields.
 *
 * The metafield mirror matters: it is what lets product cards across the theme
 * show stars without calling this app at all — the storefront reads
 * product.metafields.reviews.rating, exactly like any other review app.
 */
import prisma from "../db.server";

export async function recalcProduct(shop: string, productId: string) {
  const rows = await prisma.review.groupBy({
    by: ["rating"],
    where: { shop, productId, status: "PUBLISHED" },
    _count: { rating: true },
  });

  const buckets = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    buckets[r.rating] = r._count.rating;
    total += r._count.rating;
    sum += r.rating * r._count.rating;
  }
  const average = total ? Number((sum / total).toFixed(2)) : 0;

  await prisma.productStats.upsert({
    where: { shop_productId: { shop, productId } },
    create: {
      shop, productId, average, count: total,
      star1: buckets[1], star2: buckets[2], star3: buckets[3], star4: buckets[4], star5: buckets[5],
    },
    update: {
      average, count: total,
      star1: buckets[1], star2: buckets[2], star3: buckets[3], star4: buckets[4], star5: buckets[5],
    },
  });

  return { average, count: total, buckets };
}

/**
 * Push the aggregate into the product's metafields so the theme can read it.
 * Uses the standard keys a Shopify theme already understands.
 */
export async function pushRatingMetafields(
  admin: { graphql: (q: string, o?: any) => Promise<Response> },
  productId: string,
  average: number,
  count: number,
) {
  const gid = productId.startsWith("gid://") ? productId : `gid://shopify/Product/${productId}`;

  const mutation = `#graphql
    mutation SetRating($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`;

  const metafields = [
    {
      ownerId: gid,
      namespace: "reviews",
      key: "rating",
      type: "rating",
      value: JSON.stringify({ scale_min: "1.0", scale_max: "5.0", value: String(average || 0) }),
    },
    {
      ownerId: gid,
      namespace: "reviews",
      key: "rating_count",
      type: "number_integer",
      value: String(count),
    },
  ];

  const res = await admin.graphql(mutation, { variables: { metafields } });
  const body = await res.json();
  const errors = body?.data?.metafieldsSet?.userErrors;
  if (errors?.length) console.error("metafieldsSet errors", errors);
  return body;
}
