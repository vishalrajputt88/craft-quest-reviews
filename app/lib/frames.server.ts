/**
 * Frames: build the storefront config and publish it to an app-owned metafield.
 *
 * Why a metafield instead of an API call from the storefront:
 * the theme block reads `app.metafields.cq_frames.config` directly in Liquid,
 * so the preview renders with zero requests to our server. That makes it
 * instant, and immune to the free-tier host sleeping.
 *
 * Call publishFrameConfig() after any change to styles, sets or settings.
 */
import prisma from "../db.server";

type Admin = { graphql: (q: string, o?: any) => Promise<Response> };

export const FRAME_NAMESPACE = "cq_frames";
export const FRAME_KEY = "config";

export async function buildFrameConfig(shop: string) {
  const [styles, sets, settings] = await Promise.all([
    prisma.frameStyle.findMany({ where: { shop, active: true }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }),
    prisma.frameSet.findMany({ where: { shop, active: true }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
    prisma.frameSettings.upsert({ where: { shop }, create: { shop }, update: {} }),
  ]);

  return {
    v: 1,
    settings: {
      sizeOption: settings.sizeOption,
      colorOption: settings.colorOption,
      roomImageUrl: settings.roomImageUrl,
      showScale: settings.showScale,
    },
    styles: styles.map((s) => ({
      id: s.id,
      name: s.name,
      match: s.matchValues.map((m) => m.toLowerCase().trim()),
      mode: s.mode,
      png: s.mode === "PNG" && s.overlayUrl
        ? {
            url: s.overlayUrl,
            w: s.overlayWidth,
            h: s.overlayHeight,
            slice: [s.sliceTop, s.sliceRight, s.sliceBottom, s.sliceLeft],
          }
        : null,
      css: { face: s.face, edge: s.edge, inner: s.inner },
      thickness: s.thickness,
      mat: s.matEnabled ? { color: s.matColor, width: s.matWidth } : null,
      swatch: { color: s.swatchColor, url: s.swatchUrl },
    })),
    sets: sets.map((s) => ({
      id: s.id,
      name: s.name,
      styles: s.styleIds,
      rule: s.rule,
      values: s.ruleValues.map((v) => v.toLowerCase().trim()),
      priority: s.priority,
    })),
  };
}

async function appInstallationId(admin: Admin): Promise<string> {
  const res = await admin.graphql(`#graphql
    query { currentAppInstallation { id } }`);
  const j = await res.json();
  return j.data.currentAppInstallation.id;
}

export async function publishFrameConfig(admin: Admin, shop: string) {
  const config = await buildFrameConfig(shop);
  const ownerId = await appInstallationId(admin);

  const res = await admin.graphql(
    `#graphql
    mutation Publish($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`,
    {
      variables: {
        metafields: [{
          ownerId,
          namespace: FRAME_NAMESPACE,
          key: FRAME_KEY,
          type: "json",
          value: JSON.stringify(config),
        }],
      },
    },
  );
  const j = await res.json();
  const err = j?.data?.metafieldsSet?.userErrors?.[0];
  if (err) throw new Error(`Publish failed: ${err.message}`);

  await prisma.frameSettings.update({ where: { shop }, data: { publishedAt: new Date() } });
  return config;
}

/** Colour presets offered when creating a CSS-mode frame. */
export const CSS_PRESETS: Record<string, { face: string; edge: string; inner: string; swatch: string; mat: string }> = {
  Black:     { face: "linear-gradient(135deg,#2b2b2b,#141414 45%,#303030)", edge: "#0a0a0a", inner: "#3a3a3a", swatch: "#1c1c1c", mat: "#f6f4ef" },
  Walnut:    { face: "linear-gradient(135deg,#6f472a,#4a2e1a 45%,#7b5031)", edge: "#31200f", inner: "#8a5e3a", swatch: "#5b3a22", mat: "#f4efe6" },
  Chocolate: { face: "linear-gradient(135deg,#5a3624,#3a2116 45%,#65402b)", edge: "#24140c", inner: "#7a5038", swatch: "#4a2c1d", mat: "#f4efe6" },
  Golden:    { face: "linear-gradient(135deg,#d9ac53,#9c7222 45%,#e3bd6d)", edge: "#7d5a17", inner: "#e8c883", swatch: "#b8892b", mat: "#f8f4ea" },
  Silver:    { face: "linear-gradient(135deg,#e2e5e9,#b3b7bd 45%,#eef0f3)", edge: "#8d9197", inner: "#f0f2f4", swatch: "#c8cbd0", mat: "#f8f8f8" },
  White:     { face: "linear-gradient(135deg,#ffffff,#eceae4 45%,#ffffff)", edge: "#d5d1c8", inner: "#ffffff", swatch: "#f2efe9", mat: "#ffffff" },
  Teak:      { face: "linear-gradient(135deg,#a06c35,#6d4420 45%,#ab7740)", edge: "#4c2f16", inner: "#b5824c", swatch: "#8a5a2b", mat: "#f5f0e7" },
  Oak:       { face: "linear-gradient(135deg,#d6b68c,#ab8b63 45%,#dcc099)", edge: "#8d7150", inner: "#e2cba7", swatch: "#c2a077", mat: "#faf7f0" },
};
