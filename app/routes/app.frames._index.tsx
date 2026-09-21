/** Frames home: all frame styles and sets for this shop, plus publish status. */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, IndexTable, Badge, Text, Button, InlineStack, BlockStack,
  EmptyState, Banner, Box, Thumbnail,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { publishFrameConfig } from "../lib/frames.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [styles, sets, settings] = await Promise.all([
    prisma.frameStyle.findMany({ where: { shop }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    prisma.frameSet.findMany({ where: { shop }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
    prisma.frameSettings.upsert({ where: { shop }, create: { shop }, update: {} }),
  ]);
  const lastChange = Math.max(
    0,
    ...styles.map((s) => +new Date(s.updatedAt)),
    ...sets.map((s) => +new Date(s.updatedAt)),
    +new Date(settings.updatedAt),
  );
  const stale = !settings.publishedAt || lastChange > +new Date(settings.publishedAt) + 1000;
  return json({ styles, sets, settings, stale });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const id = String(form.get("id") || "");

  if (intent === "publish") {
    await publishFrameConfig(admin, shop);
    return json({ ok: true, message: "Published to your storefront" });
  }
  if (intent === "toggle-style") {
    const s = await prisma.frameStyle.findFirst({ where: { id, shop } });
    if (s) await prisma.frameStyle.update({ where: { id }, data: { active: !s.active } });
  }
  if (intent === "toggle-set") {
    const s = await prisma.frameSet.findFirst({ where: { id, shop } });
    if (s) await prisma.frameSet.update({ where: { id }, data: { active: !s.active } });
  }
  if (intent === "move") {
    // Reorder: swap sort values with the neighbour
    const dir = Number(form.get("dir"));
    const all = await prisma.frameStyle.findMany({ where: { shop }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
    const i = all.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i > -1 && j > -1 && j < all.length) {
      await prisma.$transaction(all.map((s, k) => {
        const pos = k === i ? j : k === j ? i : k;
        return prisma.frameStyle.update({ where: { id: s.id }, data: { sort: pos } });
      }));
    }
  }
  // Keep the storefront in sync after every change
  await publishFrameConfig(admin, shop);
  return json({ ok: true });
}

const RULE_LABEL: Record<string, string> = {
  ALL: "All products", COLLECTION: "Collections", TAG: "Tags", PRODUCT_TYPE: "Product types", PRODUCT: "Specific products",
};

export default function Frames() {
  const { styles, sets, stale } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; message?: string }>();
  const navigate = useNavigate();
  const busy = fetcher.state !== "idle";
  const styleName = (id: string) => styles.find((s: any) => s.id === id)?.name || "—";

  return (
    <Page
      title="Frames"
      subtitle="Frame finishes customers can preview on your products"
      primaryAction={{ content: "Add frame", onAction: () => navigate("/app/frames/styles/new") }}
      secondaryActions={[
        { content: "Frame settings", onAction: () => navigate("/app/frames/settings") },
        { content: busy ? "Publishing…" : "Publish now", disabled: busy, onAction: () => fetcher.submit({ intent: "publish" }, { method: "post" }) },
      ]}
    >
      <Layout>
        {stale && (
          <Layout.Section>
            <Banner tone="warning" title="Unpublished changes">
              <p>Your storefront is showing an older frame setup.</p>
            </Banner>
          </Layout.Section>
        )}
        {fetcher.data?.message && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>{fetcher.data.message}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            <Box padding="400"><Text as="h2" variant="headingMd">Frame styles</Text></Box>
            {styles.length === 0 ? (
              <EmptyState
                heading="Add your first frame"
                action={{ content: "Add frame", onAction: () => navigate("/app/frames/styles/new") }}
                image=""
              >
                <p>Upload a frame PNG, or start with a colour preset and swap in artwork later.</p>
              </EmptyState>
            ) : (
              <IndexTable
                itemCount={styles.length}
                selectable={false}
                headings={[{ title: "" }, { title: "Frame" }, { title: "Type" }, { title: "Variant values" }, { title: "Status" }, { title: "" }]}
              >
                {styles.map((s: any, i: number) => (
                  <IndexTable.Row id={s.id} key={s.id} position={i}>
                    <IndexTable.Cell>
                      {s.mode === "PNG" && s.overlayUrl ? (
                        <Thumbnail source={s.overlayUrl} alt={s.name} size="small" />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: "50%", background: s.face, boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }} />
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button variant="plain" onClick={() => navigate(`/app/frames/styles/${s.id}`)}>{s.name}</Button>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={s.mode === "PNG" ? "success" : "info"}>{s.mode === "PNG" ? "Image" : "Colour"}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued">{s.matchValues.join(", ") || "—"}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={s.active ? "success" : undefined}>{s.active ? "Active" : "Hidden"}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="100" wrap={false}>
                        <Button size="slim" disabled={i === 0 || busy} onClick={() => fetcher.submit({ intent: "move", id: s.id, dir: "-1" }, { method: "post" })}>↑</Button>
                        <Button size="slim" disabled={i === styles.length - 1 || busy} onClick={() => fetcher.submit({ intent: "move", id: s.id, dir: "1" }, { method: "post" })}>↓</Button>
                        <Button size="slim" disabled={busy} onClick={() => fetcher.submit({ intent: "toggle-style", id: s.id }, { method: "post" })}>{s.active ? "Hide" : "Show"}</Button>
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Frame sets</Text>
                  <Text as="p" tone="subdued">Decide which frames appear on which products. With no sets, every active frame shows everywhere.</Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/frames/sets/new")}>Add set</Button>
              </InlineStack>
            </Box>
            {sets.length > 0 && (
              <IndexTable
                itemCount={sets.length}
                selectable={false}
                headings={[{ title: "Set" }, { title: "Applies to" }, { title: "Frames" }, { title: "Priority" }, { title: "Status" }, { title: "" }]}
              >
                {sets.map((s: any, i: number) => (
                  <IndexTable.Row id={s.id} key={s.id} position={i}>
                    <IndexTable.Cell>
                      <Button variant="plain" onClick={() => navigate(`/app/frames/sets/${s.id}`)}>{s.name}</Button>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{RULE_LABEL[s.rule]}{s.ruleValues.length ? `: ${s.ruleValues.slice(0, 3).join(", ")}${s.ruleValues.length > 3 ? "…" : ""}` : ""}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" tone="subdued">{s.styleIds.map(styleName).join(", ")}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{s.priority}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={s.active ? "success" : undefined}>{s.active ? "Active" : "Off"}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Button size="slim" disabled={busy} onClick={() => fetcher.submit({ intent: "toggle-set", id: s.id }, { method: "post" })}>{s.active ? "Turn off" : "Turn on"}</Button>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
