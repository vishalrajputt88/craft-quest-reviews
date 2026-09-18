# Craft Quest Reviews — setup

A multi-tenant Shopify reviews app. Distribution is **Unlisted**: no App Store
listing, no app review, and you can install it on as many stores as you like
by sharing the install link.

---

## 1. Accounts (all free)

| What | Where | Notes |
|---|---|---|
| Partner account | partners.shopify.com | create the app here |
| Dev store | Partner dashboard → Stores | free, for testing |
| Database | neon.tech | free Postgres |
| Hosting | vercel.com | free Hobby tier |
| Images (optional) | cloudinary.com | free tier, unsigned upload preset |

Note on Vercel: the Hobby plan is for non-commercial use. Fine for your own
stores and development; if you start charging other merchants, move to Pro or
to Render/Fly.

---

## 2. Scaffold

```bash
npm init @shopify/app@latest -- --template remix
cd your-app-name
```

Then copy the files from this bundle over the generated project:

```
prisma/schema.prisma
app/lib/proxy.server.ts
app/lib/stats.server.ts
app/lib/validate.server.ts
app/routes/proxy.reviews.tsx
app/routes/proxy.helpful.tsx
app/routes/app._index.tsx
app/routes/app.settings.tsx
app/routes/webhooks.*.tsx
extensions/reviews-widget/**
shopify.app.toml          (merge into the generated one — keep your client_id)
.env.example              (copy to .env and fill in)
```

Install the extra deps:

```bash
npm i @shopify/shopify-app-session-storage-prisma
npm i -D prisma
```

---

## 3. Database

Create a Neon project, then put **both** URLs in `.env`:
`DATABASE_URL` = pooled connection, `DIRECT_URL` = direct connection.
Prisma needs the direct one for migrations.

```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## 4. Run it

```bash
npm run dev
```

The CLI will ask which store to install on, set up the tunnel and update your
app URLs automatically. Open the product page, add the **Product reviews**
block from the theme editor (Add block → Apps), and submit a test review.

---

## 5. Deploy

```bash
vercel                     # first deploy, then set env vars in the dashboard
npm run deploy             # pushes the extension + app config to Shopify
```

In the Partner Dashboard set:
- App URL → your Vercel URL
- Allowed redirect URLs → `https://your-app.vercel.app/auth/callback`
- App Proxy → subpath prefix `apps`, subpath `reviews`, URL `https://your-app.vercel.app/proxy`
- Distribution → **Unlisted**

---

## 6. Installing on another store later

Partner Dashboard → your app → **Distribution** → copy the install link, open it
while logged into that store's admin. Nothing in the code changes: the new shop
gets its own Session row and its own reviews, keyed by `shop`.

---

## How the multi-tenant safety works

1. `requireShop()` verifies the HMAC signature Shopify puts on every App Proxy
   request, then reads `shop` from the signed query — never from the POST body.
2. Every Prisma query includes `where: { shop }`. Note that updates use
   `updateMany({ where: { id, shop } })` rather than `update({ where: { id } })`,
   so a guessed id from another store matches zero rows instead of succeeding.
3. `unauthenticated.admin(shop)` loads that specific store's offline token when
   the app needs the Admin API outside an admin session.

If you add new routes, keep those three rules and tenants stay isolated.

---

## What is left to build

- **Scheduled sender** for review-request emails. Vercel Cron hits a route that
  reads `ReviewRequest` rows where `sendAt <= now` and `sentAt is null`, then
  sends through Resend/Klaviyo.
- **Cloudinary wiring**: add `data-cloud-name` and `data-upload-preset` to the
  widget root in `blocks/reviews.liquid` from your block settings.
- **Product title caching**: fill `productTitle`/`productHandle` on create so the
  admin table reads nicely (one Admin API call, or a webhook).
- **Billing API**, only if you charge other merchants.
