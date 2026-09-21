/**
 * Frame set editor: which frames, on which products.
 * Collections are picked with Shopify's resource picker so the merchant
 * never types a handle.
 */
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, TextField, Select, Checkbox, Text, Banner,
  Button, Tag, RangeSlider,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { publishFrameConfig } from "../lib/frames.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const styles = await prisma.frameStyle.findMany({ where: { shop }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
  if (params.id === "new") {
    return json({ set: { id: "new", name: "", styleIds: [], rule: "ALL", ruleValues: [], priority: 0, active: true }, styles });
  }
  const set = await prisma.frameSet.findFirst({ where: { id: params.id, shop } });
  if (!set) throw new Response("Not found", { status: 404 });
  return json({ set, styles });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();

  if (form.get("intent") === "delete" && params.id !== "new") {
    await prisma.frameSet.deleteMany({ where: { id: params.id, shop } });
    await publishFrameConfig(admin, shop);
    return redirect("/app/frames");
  }

  const name = String(form.get("name") || "").trim();
  if (!name) return json({ error: "Give the set a name." }, { status: 422 });

  // Only accept style ids that belong to this shop
  const requested = JSON.parse(String(form.get("styleIds") || "[]")) as string[];
  const owned = await prisma.frameStyle.findMany({ where: { shop, id: { in: requested } }, select: { id: true } });
  const ownedIds = new Set(owned.map((o) => o.id));
  const styleIds = requested.filter((id) => ownedIds.has(id));
  if (!styleIds.length) return json({ error: "Pick at least one frame." }, { status: 422 });

  const rule = String(form.get("rule") || "ALL") as any;
  const ruleValues = JSON.parse(String(form.get("ruleValues") || "[]")) as string[];
  if (rule !== "ALL" && !ruleValues.length) return json({ error: "Add at least one value for this rule." }, { status: 422 });

  const data = {
    name, styleIds, rule, ruleValues: rule === "ALL" ? [] : ruleValues,
    priority: Number(form.get("priority") || 0),
    active: form.get("active") === "true",
  };

  let id = params.id!;
  if (id === "new") {
    id = (await prisma.frameSet.create({ data: { ...data, shop } })).id;
  } else {
    await prisma.frameSet.updateMany({ where: { id, shop }, data });
  }
  await publishFrameConfig(admin, shop);
  return redirect(`/app/frames/sets/${id}?saved=1`);
}

const RULE_OPTIONS = [
  { label: "All products", value: "ALL" },
  { label: "Products in collections", value: "COLLECTION" },
  { label: "Products with tags", value: "TAG" },
  { label: "Products of type", value: "PRODUCT_TYPE" },
  { label: "Specific products", value: "PRODUCT" },
];

export default function SetEditor() {
  const { set, styles } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const nav = useNavigation();
  const submit = useSubmit();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [name, setName] = useState(set.name);
  const [styleIds, setStyleIds] = useState<string[]>(set.styleIds);
  const [rule, setRule] = useState<string>(set.rule);
  const [values, setValues] = useState<string[]>(set.ruleValues);
  // Labels for picked resources, so chips read "Spiritual Frames" not a handle
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [priority, setPriority] = useState<number>(set.priority);
  const [active, setActive] = useState<boolean>(set.active);
  const saved = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("saved");

  function toggleStyle(id: string) {
    setStyleIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function pick(type: "collection" | "product") {
    const res: any = await (shopify as any).resourcePicker({ type, multiple: true, action: "select" });
    if (!res) return;
    const next = new Set(values);
    const nextLabels = { ...labels };
    for (const r of res) {
      // Collections match by handle (Liquid has it); products by numeric id.
      const v = type === "collection" ? r.handle : String(r.id).split("/").pop();
      if (!v) continue;
      next.add(v);
      nextLabels[v] = r.title;
    }
    setValues([...next]);
    setLabels(nextLabels);
  }

  function addDraft() {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setValues((p) => [...new Set([...p, ...parts])]);
    setDraft("");
  }

  function save() {
    submit(
      { name, styleIds: JSON.stringify(styleIds), rule, ruleValues: JSON.stringify(values), priority: String(priority), active: String(active) },
      { method: "post" },
    );
  }

  return (
    <Page
      backAction={{ content: "Frames", onAction: () => navigate("/app/frames") }}
      title={set.id === "new" ? "Add frame set" : name || "Frame set"}
      primaryAction={{ content: "Save", loading: nav.state !== "idle", onAction: save }}
      secondaryActions={set.id !== "new" ? [{ content: "Delete", destructive: true, onAction: () => { if (confirm("Delete this set?")) submit({ intent: "delete" }, { method: "post" }); } }] : []}
    >
      <Layout>
        {actionData?.error && <Layout.Section><Banner tone="critical">{actionData.error}</Banner></Layout.Section>}
        {saved && !actionData?.error && <Layout.Section><Banner tone="success">Saved and published.</Banner></Layout.Section>}

        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <TextField label="Set name" value={name} onChange={setName} autoComplete="off" placeholder="Wooden classics" />
                <Checkbox label="Active" checked={active} onChange={setActive} />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Frames in this set</Text>
                <Text as="p" tone="subdued">Customers see these, in this order.</Text>
                {styles.length === 0 ? (
                  <Banner>Add some frames first.</Banner>
                ) : (
                  styles.map((st: any) => (
                    <InlineStack key={st.id} gap="300" blockAlign="center">
                      <Checkbox label="" labelHidden checked={styleIds.includes(st.id)} onChange={() => toggleStyle(st.id)} />
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: st.mode === "PNG" && st.overlayUrl ? `center/cover url("${st.overlayUrl}")` : st.face, boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }} />
                      <Text as="span">{st.name}</Text>
                      {!st.active && <Text as="span" tone="subdued">(hidden)</Text>}
                    </InlineStack>
                  ))
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Applies to</Text>
                <Select label="Rule" labelHidden options={RULE_OPTIONS} value={rule} onChange={(v) => { setRule(v); setValues([]); }} />

                {rule === "COLLECTION" && <Button onClick={() => pick("collection")}>Choose collections</Button>}
                {rule === "PRODUCT" && <Button onClick={() => pick("product")}>Choose products</Button>}
                {(rule === "TAG" || rule === "PRODUCT_TYPE") && (
                  <InlineStack gap="200" blockAlign="end">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label={rule === "TAG" ? "Tags" : "Product types"}
                        value={draft} onChange={setDraft} autoComplete="off"
                        placeholder={rule === "TAG" ? "Spiritual Frames, Bestseller" : "Wall Art"}
                        onBlur={addDraft}
                      />
                    </div>
                    <Button onClick={addDraft}>Add</Button>
                  </InlineStack>
                )}

                {values.length > 0 && (
                  <InlineStack gap="200" wrap>
                    {values.map((v) => (
                      <Tag key={v} onRemove={() => setValues((p) => p.filter((x) => x !== v))}>{labels[v] || v}</Tag>
                    ))}
                  </InlineStack>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Priority</Text>
              <RangeSlider label="Priority" labelHidden min={0} max={100} value={priority} onChange={(v) => setPriority(Number(v))} output />
              <Text as="p" tone="subdued">When a product matches several sets, the highest priority wins. Give specific rules (single products) a higher number than broad ones (all products).</Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
