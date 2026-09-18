/** Per-shop settings. */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Checkbox, Select, TextField, Button, BlockStack } from "@shopify/polaris";
import { useState } from "react";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop },
    update: {},
  });
  return json({ settings });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  await prisma.shopSettings.update({
    where: { shop: session.shop },
    data: {
      autoPublish: form.get("autoPublish") === "on",
      requireVerified: form.get("requireVerified") === "on",
      allowImages: form.get("allowImages") === "on",
      requestEmails: form.get("requestEmails") === "on",
      maxImages: Number(form.get("maxImages") || 3),
      requestDelayDays: Number(form.get("requestDelayDays") || 7),
      brandColor: String(form.get("brandColor") || "#b8892b"),
    },
  });
  return redirect("/app/settings");
}

export default function Settings() {
  const { settings } = useLoaderData<typeof loader>();
  const [s, setS] = useState(settings);

  return (
    <Page title="Settings">
      <Card>
        <Form method="post">
          <BlockStack gap="400">
            <Checkbox
              label="Publish new reviews automatically"
              helpText="Off means every review waits for your approval."
              checked={s.autoPublish}
              onChange={(v) => setS({ ...s, autoPublish: v })}
            />
            <input type="hidden" name="autoPublish" value={s.autoPublish ? "on" : ""} />

            <Checkbox
              label="Only verified buyers can review"
              checked={s.requireVerified}
              onChange={(v) => setS({ ...s, requireVerified: v })}
            />
            <input type="hidden" name="requireVerified" value={s.requireVerified ? "on" : ""} />

            <Checkbox
              label="Allow photo reviews"
              checked={s.allowImages}
              onChange={(v) => setS({ ...s, allowImages: v })}
            />
            <input type="hidden" name="allowImages" value={s.allowImages ? "on" : ""} />

            <Select
              label="Photos per review"
              options={["1", "2", "3", "4", "5"].map((v) => ({ label: v, value: v }))}
              value={String(s.maxImages)}
              onChange={(v) => setS({ ...s, maxImages: Number(v) })}
              name="maxImages"
            />

            <Checkbox
              label="Email customers to ask for a review"
              checked={s.requestEmails}
              onChange={(v) => setS({ ...s, requestEmails: v })}
            />
            <input type="hidden" name="requestEmails" value={s.requestEmails ? "on" : ""} />

            <TextField
              label="Days after delivery to ask"
              type="number"
              value={String(s.requestDelayDays)}
              onChange={(v) => setS({ ...s, requestDelayDays: Number(v) })}
              name="requestDelayDays"
              autoComplete="off"
            />

            <TextField
              label="Accent colour"
              value={s.brandColor}
              onChange={(v) => setS({ ...s, brandColor: v })}
              name="brandColor"
              autoComplete="off"
              helpText="Used by the storefront widget."
            />

            <Button submit variant="primary">Save</Button>
          </BlockStack>
        </Form>
      </Card>
    </Page>
  );
}
