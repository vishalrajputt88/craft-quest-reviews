/** POST /apps/reviews/helpful — marks a review helpful. One vote per browser (client-side guard). */
import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { requireShop, json } from "../lib/proxy.server";

export async function action({ request }: ActionFunctionArgs) {
  const shop = requireShop(request);
  const form = await request.formData();
  const id = String(form.get("id") || "");
  if (!id) return json({ error: "Missing id" }, { status: 400 });

  // The shop filter is what stops a crafted id from touching another store's row.
  const result = await prisma.review.updateMany({
    where: { id, shop, status: "PUBLISHED" },
    data: { helpfulCount: { increment: 1 } },
  });
  if (result.count === 0) return json({ error: "Not found" }, { status: 404 });

  const review = await prisma.review.findFirst({ where: { id, shop }, select: { helpfulCount: true } });
  return json({ ok: true, helpfulCount: review?.helpfulCount ?? 0 });
}
