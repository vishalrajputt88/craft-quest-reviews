/**
 * Shopify's three mandatory privacy webhooks.
 * Point customers/data_request, customers/redact and shop/redact here.
 */
import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  const data: any = payload;

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      const email = data?.customer?.email;
      const reviews = await prisma.review.findMany({
        where: { shop, authorEmail: email },
        select: { id: true, productId: true, rating: true, title: true, body: true, createdAt: true },
      });
      // Deliver this to the merchant out of band (email/log) within 30 days.
      console.log("data request", shop, email, JSON.stringify(reviews));
      break;
    }
    case "CUSTOMERS_REDACT": {
      const email = data?.customer?.email;
      // Keep the review text (it's store content) but strip personal data.
      await prisma.review.updateMany({
        where: { shop, authorEmail: email },
        data: { authorEmail: null, authorName: "Anonymous", ipHash: null },
      });
      break;
    }
    case "SHOP_REDACT": {
      await prisma.review.deleteMany({ where: { shop } });
      await prisma.productStats.deleteMany({ where: { shop } });
      await prisma.reviewRequest.deleteMany({ where: { shop } });
      await prisma.shopSettings.deleteMany({ where: { shop } });
      await prisma.session.deleteMany({ where: { shop } });
      break;
    }
  }

  return new Response();
}
