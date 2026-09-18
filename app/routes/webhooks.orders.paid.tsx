/** Queue a review request for each purchased product, to be emailed later. */
import type { ActionFunctionArgs } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload } = await authenticate.webhook(request);

  const settings = await prisma.shopSettings.upsert({ where: { shop }, create: { shop }, update: {} });
  if (!settings.requestEmails) return new Response();

  const order: any = payload;
  const email = order?.email || order?.customer?.email;
  if (!email) return new Response();

  const sendAt = new Date(Date.now() + settings.requestDelayDays * 24 * 60 * 60 * 1000);

  for (const item of order.line_items || []) {
    if (!item.product_id) continue;
    await prisma.reviewRequest.upsert({
      where: {
        shop_orderId_productId: {
          shop,
          orderId: String(order.id),
          productId: String(item.product_id),
        },
      },
      create: {
        shop,
        orderId: String(order.id),
        productId: String(item.product_id),
        email,
        token: crypto.randomBytes(24).toString("hex"),
        sendAt,
      },
      update: {},
    });
  }

  return new Response();
}
