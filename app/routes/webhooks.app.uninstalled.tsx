/**
 * When a store uninstalls, drop its sessions. Review data is kept for 30 days
 * (handled by a scheduled cleanup) so a reinstall doesn't lose everything —
 * shop/redact deletes it outright when Shopify asks.
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`${topic} for ${shop}`);

  if (session) await prisma.session.deleteMany({ where: { shop } });
  await prisma.shopSettings.updateMany({ where: { shop }, data: { updatedAt: new Date() } });

  return new Response();
}
