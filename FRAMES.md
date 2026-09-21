# Frames module — install

Adds a frame configurator to the existing app: merchants manage frame finishes
and which products get them; customers preview frames live on product pages.

## New / changed files

    prisma/schema.prisma                     (3 models + 2 enums added, Session unchanged)
    app/lib/files.server.ts                  NEW  upload images to the shop's Shopify Files
    app/lib/frames.server.ts                 NEW  build + publish storefront config
    app/components/FramePreview.tsx          NEW  admin live preview
    app/routes/app.frames._index.tsx         NEW  frames list
    app/routes/app.frames.styles.$id.tsx     NEW  add/edit a frame (PNG or colour)
    app/routes/app.frames.sets.$id.tsx       NEW  which frames on which products
    app/routes/app.frames.settings.tsx       NEW  option names, room photo
    app/routes/webhooks.compliance.tsx       CHANGED  shop/redact also clears frames
    extensions/reviews-widget/blocks/frame_preview.liquid   NEW  theme app block
    extensions/reviews-widget/assets/cq-frames.js           NEW
    extensions/reviews-widget/assets/cq-frames.css          NEW

## Steps

1. Scopes — in shopify.app.toml:

       scopes = "read_products,write_products,read_orders,write_files,read_files"

   And on Render, update the SCOPES env var to the same value.

2. Database:

       npx prisma migrate dev --name frames

3. Navigation — see snippets-for-you/app.tsx.navmenu.txt.

4. Ship it:

       git add . && git commit -m "Frames module" && git push     (Render redeploys the app)
       npm run deploy                                            (pushes the theme block + scopes)

5. Open the app in the store admin. Shopify will ask to approve the new
   file permissions — approve.

6. Apps → Craft Quest → Frames → Add frame:
   - Silver: Image type, upload your silver PNG, drag the four slice sliders
     until the dashed lines sit where the moulding ends. Check Portrait,
     Landscape and Square in the preview.
   - Chocolate: same.
   - Any colour without artwork yet: Colour type, click a preset.
   Set "Matches variant values" to the exact Frame Colour values on your
   products (e.g. "Silver").

7. Theme editor → product template → Add block → Apps → **Frame preview**.

## How it works

- Frames are stored per shop, isolated by `shop` on every query.
- PNGs go into the merchant's own Shopify Files (no S3, no cost, served from
  Shopify's CDN).
- Every save publishes the whole config to an app-owned metafield
  (`cq_frames.config`). The theme block reads it in Liquid, so the storefront
  never calls the app server — instant, and unaffected by the free host
  sleeping.
- PNG frames render with CSS border-image: the four corners are never
  stretched, only the edges, so one image works for every size and
  orientation.
- Frame sets decide which frames appear where (all products, collections,
  tags, product types, or single products). Highest priority wins. With no
  sets, every active frame shows on every product.
- The block reads the product's own variants; clicking a swatch selects that
  variant in the theme's product form, so price and the theme's buy button
  follow. It also works on themes other than yours.

## Adding a new colour later

Get the PNG → Frames → Add frame → Image → upload → slice → save.
Add that value to your products' Frame Colour option (or re-import the CSV
with the new colour). Nothing in the theme changes.
