/** Store-wide frame settings: option names and the room background. */
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit, useNavigate } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, TextField, Checkbox, DropZone, Thumbnail, Text, Banner, Box, InlineStack, Button } from "@shopify/polaris";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { uploadImageToFiles } from "../lib/files.server";
import { publishFrameConfig } from "../lib/frames.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.frameSettings.upsert({ where: { shop: session.shop }, create: { shop: session.shop }, update: {} });
  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();

  let roomImageUrl: string | null | undefined = undefined;
  const file = form.get("room");
  if (file && typeof file !== "string" && file.size > 0) {
    try {
      roomImageUrl = (await uploadImageToFiles(admin, file, "Frame preview room")).url;
    } catch (e: any) {
      return json({ error: e.message }, { status: 500 });
    }
  }
  if (form.get("removeRoom") === "true") roomImageUrl = null;

  await prisma.frameSettings.update({
    where: { shop },
    data: {
      sizeOption: String(form.get("sizeOption") || "Size").trim(),
      colorOption: String(form.get("colorOption") || "Frame Colour").trim(),
      showScale: form.get("showScale") === "true",
      ...(roomImageUrl !== undefined ? { roomImageUrl } : {}),
    },
  });
  await publishFrameConfig(admin, shop);
  return redirect("/app/frames/settings?saved=1");
}

export default function FrameSettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<{ error?: string }>();
  const nav = useNavigation();
  const submit = useSubmit();
  const navigate = useNavigate();
  const [sizeOption, setSizeOption] = useState(settings.sizeOption);
  const [colorOption, setColorOption] = useState(settings.colorOption);
  const [showScale, setShowScale] = useState(settings.showScale);
  const [file, setFile] = useState<File | null>(null);
  const saved = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("saved");

  function save(extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.append("sizeOption", sizeOption);
    fd.append("colorOption", colorOption);
    fd.append("showScale", String(showScale));
    if (file) fd.append("room", file);
    Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
    submit(fd, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <Page
      backAction={{ content: "Frames", onAction: () => navigate("/app/frames") }}
      title="Frame settings"
      primaryAction={{ content: "Save", loading: nav.state !== "idle", onAction: () => save() }}
    >
      <Layout>
        {actionData?.error && <Layout.Section><Banner tone="critical">{actionData.error}</Banner></Layout.Section>}
        {saved && <Layout.Section><Banner tone="success">Saved and published.</Banner></Layout.Section>}
        <Layout.AnnotatedSection title="Product options" description="Names must match your product options exactly, including spelling.">
          <Card>
            <BlockStack gap="400">
              <TextField label="Size option" value={sizeOption} onChange={setSizeOption} autoComplete="off" helpText='Values like "12x18 inch" are read as width × height.' />
              <TextField label="Frame colour option" value={colorOption} onChange={setColorOption} autoComplete="off" />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
        <Layout.AnnotatedSection title="Room view" description="A wall photo customers see the frame hung on. Leave empty for a neutral wall.">
          <Card>
            <BlockStack gap="400">
              <DropZone accept="image/*" type="image" allowMultiple={false} onDrop={(_f, a) => setFile(a[0] || null)}>
                {file || settings.roomImageUrl ? (
                  <Box padding="400"><Thumbnail source={file ? URL.createObjectURL(file) : settings.roomImageUrl!} alt="" size="large" /></Box>
                ) : (
                  <DropZone.FileUpload actionHint="A straight-on photo of a wall works best" />
                )}
              </DropZone>
              {settings.roomImageUrl && !file && (
                <InlineStack><Button variant="plain" tone="critical" onClick={() => save({ removeRoom: "true" })}>Remove room photo</Button></InlineStack>
              )}
              <Checkbox label="Show a size reference silhouette" checked={showScale} onChange={setShowScale} />
              {settings.publishedAt && <Text as="p" tone="subdued">Last published {new Date(settings.publishedAt).toLocaleString()}</Text>}
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
