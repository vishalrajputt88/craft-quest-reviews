/**
 * Merchant dashboard: moderate reviews.
 * Every query is scoped by session.shop — that scoping is the whole
 * multi-tenant safety story, so it must never be dropped.
 */
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, useSearchParams } from "@remix-run/react";
import {
  Page, Layout, Card, IndexTable, Badge, Button, ButtonGroup, Text,
  Tabs, EmptyState, Modal, TextField, InlineStack, BlockStack, Box,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { recalcProduct, pushRatingMetafields } from "../lib/stats.server";

const STATUSES = ["PENDING", "PUBLISHED", "REJECTED", "SPAM"] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "PENDING") as (typeof STATUSES)[number];

  const [reviews, counts, stats] = await Promise.all([
    prisma.review.findMany({
      where: { shop, status },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { images: { select: { url: true } } },
    }),
    prisma.review.groupBy({ by: ["status"], where: { shop }, _count: { status: true } }),
    prisma.review.aggregate({ where: { shop, status: "PUBLISHED" }, _avg: { rating: true }, _count: true }),
  ]);

  return json({
    shop,
    status,
    reviews,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count.status])),
    average: stats._avg.rating ? Number(stats._avg.rating.toFixed(2)) : 0,
    published: stats._count,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id"));

  // scoped update: a forged id from another store simply matches nothing
  const review = await prisma.review.findFirst({ where: { id, shop } });
  if (!review) return json({ error: "Not found" }, { status: 404 });

  if (intent === "reply") {
    await prisma.review.update({
      where: { id },
      data: { reply: String(form.get("reply") || "").slice(0, 2000), repliedAt: new Date() },
    });
    return json({ ok: true });
  }

  if (intent === "delete") {
    await prisma.review.delete({ where: { id } });
  } else if (STATUSES.includes(intent as any)) {
    await prisma.review.update({ where: { id }, data: { status: intent as any } });
  }

  const { average, count } = await recalcProduct(shop, review.productId);
  await pushRatingMetafields(admin, review.productId, average, count);

  return json({ ok: true });
}

export default function Dashboard() {
  const { reviews, counts, status, average, published } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher();
  const [replyTo, setReplyTo] = useState<any>(null);
  const [replyText, setReplyText] = useState("");

  const tabs = STATUSES.map((s) => ({
    id: s,
    content: `${s.charAt(0) + s.slice(1).toLowerCase()} (${counts[s] || 0})`,
  }));
  const selected = STATUSES.indexOf(status);

  function act(id: string, intent: string, extra: Record<string, string> = {}) {
    fetcher.submit({ id, intent, ...extra }, { method: "post" });
  }

  return (
    <Page title="Reviews" subtitle={`${published} published · ${average || "—"} average`}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs
              tabs={tabs}
              selected={selected < 0 ? 0 : selected}
              onSelect={(i) => setParams({ status: STATUSES[i] })}
            />
            {reviews.length === 0 ? (
              <Box padding="800">
                <EmptyState heading="Nothing here yet" image="">
                  <p>Reviews with this status will show up here.</p>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                itemCount={reviews.length}
                selectable={false}
                headings={[
                  { title: "Review" }, { title: "Rating" },
                  { title: "Product" }, { title: "Date" }, { title: "Actions" },
                ]}
              >
                {reviews.map((r: any, i: number) => (
                  <IndexTable.Row id={r.id} key={r.id} position={i}>
                    <IndexTable.Cell>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" fontWeight="semibold">{r.authorName}</Text>
                          {r.verified && <Badge tone="success">Verified</Badge>}
                        </InlineStack>
                        {r.title && <Text as="p" fontWeight="medium">{r.title}</Text>}
                        <Text as="p" tone="subdued">{r.body.slice(0, 180)}</Text>
                        {r.reply && <Text as="p" tone="subdued">↳ {r.reply.slice(0, 120)}</Text>}
                      </BlockStack>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{"★".repeat(r.rating)}</IndexTable.Cell>
                    <IndexTable.Cell>{r.productTitle || r.productId}</IndexTable.Cell>
                    <IndexTable.Cell>{new Date(r.createdAt).toLocaleDateString()}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <ButtonGroup>
                        {r.status !== "PUBLISHED" && (
                          <Button size="slim" variant="primary" onClick={() => act(r.id, "PUBLISHED")}>Publish</Button>
                        )}
                        {r.status !== "REJECTED" && (
                          <Button size="slim" onClick={() => act(r.id, "REJECTED")}>Reject</Button>
                        )}
                        <Button size="slim" onClick={() => { setReplyTo(r); setReplyText(r.reply || ""); }}>Reply</Button>
                        <Button size="slim" tone="critical" onClick={() => act(r.id, "delete")}>Delete</Button>
                      </ButtonGroup>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={!!replyTo}
        onClose={() => setReplyTo(null)}
        title="Reply to review"
        primaryAction={{
          content: "Save reply",
          onAction: () => { act(replyTo.id, "reply", { reply: replyText }); setReplyTo(null); },
        }}
      >
        <Modal.Section>
          <TextField
            label="Your reply"
            value={replyText}
            onChange={setReplyText}
            multiline={4}
            autoComplete="off"
            helpText="Shown publicly under the review."
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
