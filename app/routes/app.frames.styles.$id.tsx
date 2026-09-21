/**
 * Create / edit one frame style.
 * PNG mode: upload an overlay into the store's Shopify Files, then set the
 * four slice insets by eye against the guide — the live preview updates as
 * the sliders move. CSS mode: pick a preset and fine-tune the colours.
 */
import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit, useNavigate } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, InlineStack, TextField, Select, RangeSlider, Checkbox,
  DropZone, Thumbnail, Text, Banner, Button, ChoiceList, InlineGrid, Box, Divider,
} from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { uploadImageToFiles } from "../lib/files.server";
import { publishFrameConfig, CSS_PRESETS } from "../lib/frames.server";
import { FramePreview, SliceGuide } from "../components/FramePreview";

const EMPTY = {
  id: "new", name: "", matchValues: [] as string[], mode: "CSS" as "PNG" | "CSS",
  overlayUrl: null as string | null, overlayWidth: null as number | null, overlayHeight: null as number | null,
  sliceTop: 10, sliceRight: 10, sliceBottom: 10, sliceLeft: 10,
  face: CSS_PRESETS.Black.face, edge: CSS_PRESETS.Black.edge, inner: CSS_PRESETS.Black.inner,
  thickness: 5, matEnabled: true, matColor: "#f6f4ef", matWidth: 5,
  swatchColor: CSS_PRESETS.Black.swatch, swatchUrl: null as string | null, active: true,
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (params.id === "new") return json({ style: EMPTY, presets: CSS_PRESETS });
  const style = await prisma.frameStyle.findFirst({ where: { id: params.id, shop: session.shop } });
  if (!style) throw new Response("Not found", { status: 404 });
  return json({ style, presets: CSS_PRESETS });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = String(form.get("intent") || "save");

  if (intent === "delete" && params.id !== "new") {
    await prisma.frameStyle.deleteMany({ where: { id: params.id, shop } });
    // Drop the deleted style from any set that referenced it
    const sets = await prisma.frameSet.findMany({ where: { shop, styleIds: { has: params.id! } } });
    for (const s of sets) {
      await prisma.frameSet.update({ where: { id: s.id }, data: { styleIds: s.styleIds.filter((x) => x !== params.id) } });
    }
    await publishFrameConfig(admin, shop);
    return redirect("/app/frames");
  }

  const num = (k: string, d: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) ? n : d;
  };
  const name = String(form.get("name") || "").trim();
  if (!name) return json({ error: "Give the frame a name." }, { status: 422 });

  const matchValues = String(form.get("matchValues") || "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  if (!matchValues.length) matchValues.push(name);

  const mode = String(form.get("mode")) === "PNG" ? "PNG" : "CSS";

  let overlay: { url?: string; fileId?: string; width?: number; height?: number } = {};
  const file = form.get("overlay");
  if (file && typeof file !== "string" && file.size > 0) {
    if (!/^image\/(png|webp)$/.test(file.type)) {
      return json({ error: "Frame overlays must be PNG or WebP with a transparent centre." }, { status: 422 });
    }
    if (file.size > 8 * 1024 * 1024) return json({ error: "Keep the overlay under 8 MB." }, { status: 422 });
    try {
      const up = await uploadImageToFiles(admin, file, `${name} frame overlay`);
      overlay = { url: up.url, fileId: up.fileId, width: up.width, height: up.height };
    } catch (e: any) {
      return json({ error: e.message || "Upload failed" }, { status: 500 });
    }
  }

  const data = {
    name, matchValues, mode: mode as any,
    sliceTop: num("sliceTop", 10), sliceRight: num("sliceRight", 10),
    sliceBottom: num("sliceBottom", 10), sliceLeft: num("sliceLeft", 10),
    face: String(form.get("face") || EMPTY.face),
    edge: String(form.get("edge") || EMPTY.edge),
    inner: String(form.get("inner") || EMPTY.inner),
    thickness: num("thickness", 5),
    matEnabled: form.get("matEnabled") === "true",
    matColor: String(form.get("matColor") || "#f6f4ef"),
    matWidth: num("matWidth", 5),
    swatchColor: String(form.get("swatchColor") || "#1c1c1c"),
    ...(overlay.url ? {
      overlayUrl: overlay.url, overlayFileId: overlay.fileId,
      overlayWidth: overlay.width, overlayHeight: overlay.height,
    } : {}),
  };

  if (mode === "PNG" && !overlay.url) {
    const existing = params.id !== "new"
      ? await prisma.frameStyle.findFirst({ where: { id: params.id, shop }, select: { overlayUrl: true } })
      : null;
    if (!existing?.overlayUrl) return json({ error: "Upload a PNG overlay, or switch to Colour mode." }, { status: 422 });
  }

  let id = params.id!;
  if (id === "new") {
    const count = await prisma.frameStyle.count({ where: { shop } });
    const created = await prisma.frameStyle.create({ data: { ...data, shop, sort: count } });
    id = created.id;
  } else {
    const r = await prisma.frameStyle.updateMany({ where: { id, shop }, data });
    if (r.count === 0) return json({ error: "Not found" }, { status: 404 });
  }

  await publishFrameConfig(admin, shop);
  return redirect(`/app/frames/styles/${id}?saved=1`);
}

export default function StyleEditor() {
  const { style, presets } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const nav = useNavigation();
  const submit = useSubmit();
  const navigate = useNavigate();
  const saving = nav.state !== "idle";

  const [s, setS] = useState<any>({ ...style, matchValues: (style.matchValues || []).join(", ") });
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState("2 / 3");
  const saved = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("saved");

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setLocalUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const overlayForPreview = localUrl || s.overlayUrl;
  const set = (k: string) => (v: any) => setS((p: any) => ({ ...p, [k]: v }));

  const previewStyle = useMemo(() => ({ ...s, overlayUrl: overlayForPreview }), [s, overlayForPreview]);

  function applyPreset(name: string) {
    const p = (presets as any)[name];
    if (!p) return;
    setS((prev: any) => ({
      ...prev, face: p.face, edge: p.edge, inner: p.inner, swatchColor: p.swatch, matColor: p.mat,
      name: prev.name || name, matchValues: prev.matchValues || name,
    }));
  }

  function save() {
    const fd = new FormData();
    Object.entries(s).forEach(([k, v]) => {
      if (v === null || v === undefined || k === "id") return;
      fd.append(k, String(v));
    });
    if (file) fd.append("overlay", file);
    submit(fd, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <Page
      backAction={{ content: "Frames", onAction: () => navigate("/app/frames") }}
      title={style.id === "new" ? "Add frame" : s.name || "Frame"}
      primaryAction={{ content: saving ? "Saving…" : "Save", loading: saving, onAction: save }}
      secondaryActions={style.id !== "new" ? [{
        content: "Delete", destructive: true,
        onAction: () => { if (confirm("Delete this frame?")) submit({ intent: "delete" }, { method: "post" }); },
      }] : []}
    >
      <Layout>
        {actionData?.error && <Layout.Section><Banner tone="critical">{actionData.error}</Banner></Layout.Section>}
        {saved && !actionData?.error && <Layout.Section><Banner tone="success">Saved and published to your storefront.</Banner></Layout.Section>}

        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <TextField label="Frame name" value={s.name} onChange={set("name")} autoComplete="off" placeholder="Silver" />
                <TextField
                  label="Matches variant values"
                  value={s.matchValues}
                  onChange={set("matchValues")}
                  autoComplete="off"
                  helpText="Comma separated. This frame shows when the product's frame colour option equals any of these, e.g. Silver, Chrome."
                />
                <ChoiceList
                  title="Frame type"
                  choices={[
                    { label: "Image (PNG overlay)", value: "PNG", helpText: "Best realism. Upload your frame artwork." },
                    { label: "Colour (drawn in CSS)", value: "CSS", helpText: "Use until the artwork is ready." },
                  ]}
                  selected={[s.mode]}
                  onChange={(v) => set("mode")(v[0])}
                />
              </BlockStack>
            </Card>

            {s.mode === "PNG" ? (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Frame image</Text>
                  <DropZone accept="image/png,image/webp" type="image" allowMultiple={false} onDrop={(_f, accepted) => setFile(accepted[0] || null)}>
                    {overlayForPreview ? (
                      <Box padding="400"><InlineStack gap="300" blockAlign="center">
                        <Thumbnail source={overlayForPreview} alt="" size="large" />
                        <Text as="p" tone="subdued">{file ? file.name : "Current overlay"} — drop a new file to replace</Text>
                      </InlineStack></Box>
                    ) : (
                      <DropZone.FileUpload actionHint="PNG or WebP, transparent in the middle" />
                    )}
                  </DropZone>

                  {overlayForPreview && (
                    <>
                      <Divider />
                      <Text as="h3" variant="headingSm">Slice the frame</Text>
                      <Text as="p" tone="subdued">
                        Move each line to where the moulding ends. Corners stay untouched; only the edges stretch, so one image fits every size and orientation.
                      </Text>
                      <SliceGuide url={overlayForPreview} slice={[s.sliceTop, s.sliceRight, s.sliceBottom, s.sliceLeft]} />
                      <InlineGrid columns={2} gap="400">
                        <RangeSlider label="Top" min={0} max={45} step={0.5} value={s.sliceTop} onChange={set("sliceTop")} output suffix={`${s.sliceTop}%`} />
                        <RangeSlider label="Right" min={0} max={45} step={0.5} value={s.sliceRight} onChange={set("sliceRight")} output suffix={`${s.sliceRight}%`} />
                        <RangeSlider label="Bottom" min={0} max={45} step={0.5} value={s.sliceBottom} onChange={set("sliceBottom")} output suffix={`${s.sliceBottom}%`} />
                        <RangeSlider label="Left" min={0} max={45} step={0.5} value={s.sliceLeft} onChange={set("sliceLeft")} output suffix={`${s.sliceLeft}%`} />
                      </InlineGrid>
                      <Button variant="plain" onClick={() => setS((p: any) => ({ ...p, sliceRight: p.sliceTop, sliceBottom: p.sliceTop, sliceLeft: p.sliceTop }))}>
                        Make all sides match Top
                      </Button>
                    </>
                  )}
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Colour</Text>
                  <InlineStack gap="200" wrap>
                    {Object.entries(presets as any).map(([name, p]: any) => (
                      <button
                        key={name} type="button" onClick={() => applyPreset(name)} title={name}
                        style={{ width: 36, height: 36, borderRadius: "50%", border: 0, cursor: "pointer", background: p.face, boxShadow: "0 0 0 1px rgba(0,0,0,.15)" }}
                      />
                    ))}
                  </InlineStack>
                  <TextField label="Face (CSS background)" value={s.face} onChange={set("face")} autoComplete="off" multiline={2} />
                  <InlineGrid columns={2} gap="400">
                    <TextField label="Outer edge" value={s.edge} onChange={set("edge")} autoComplete="off" />
                    <TextField label="Highlight" value={s.inner} onChange={set("inner")} autoComplete="off" />
                  </InlineGrid>
                </BlockStack>
              </Card>
            )}

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Proportions</Text>
                <RangeSlider label="Frame thickness" helpText="Percent of the print's short side" min={1} max={15} step={0.5} value={s.thickness} onChange={set("thickness")} output suffix={`${s.thickness}%`} />
                <Checkbox label="Show a mat board inside the frame" checked={s.matEnabled} onChange={set("matEnabled")} />
                {s.matEnabled && (
                  <InlineGrid columns={2} gap="400">
                    <TextField label="Mat colour" value={s.matColor} onChange={set("matColor")} autoComplete="off" />
                    <RangeSlider label="Mat width" min={1} max={15} step={0.5} value={s.matWidth} onChange={set("matWidth")} output suffix={`${s.matWidth}%`} />
                  </InlineGrid>
                )}
                <TextField label="Swatch colour" value={s.swatchColor} onChange={set("swatchColor")} autoComplete="off" helpText="The small circle customers click on." />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <div style={{ position: "sticky", top: 16 }}>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Live preview</Text>
                  <Select label="Shape" labelHidden value={ratio} onChange={setRatio}
                    options={[{ label: "Portrait", value: "2 / 3" }, { label: "Landscape", value: "3 / 2" }, { label: "Square", value: "1 / 1" }]} />
                </InlineStack>
                <FramePreview style={previewStyle} ratio={ratio} height={380} />
                <Text as="p" tone="subdued">Switch shapes to check the corners hold up.</Text>
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
