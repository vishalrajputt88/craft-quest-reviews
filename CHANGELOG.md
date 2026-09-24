# @shopify/shopify-app-template-remix

## 2025.12.11

- [#1201](https://github.com/Shopify/shopify-app-template-remix/pull/1201) Update `@shopify/shopify-app-remix` to v4.1.0 and `@shopify/shopify-app-session-storage-prisma` to v8.0.0, add refresh token fields (`refreshToken` and `refreshTokenExpires`) to Session model in Prisma schema, and adopt the `expiringOfflineAccessTokens` flag for enhanced security through token rotation. See [expiring vs non-expiring offline tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens#expiring-vs-non-expiring-offline-tokens) for more information.

## 2025.10.01

**Remix is now React Router.** As of [React Router v7](https://remix.run/blog/merging-remix-and-react-router), Remix and React Router have merged.

For new projects, use the **[Shopify App Template - React Router](https://github.com/Shopify/shopify-app-template-react-router)** instead.

To migrate your existing Remix app, follow the **[migration guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix)**.

## 2025.08.16
- [#52](https://github.com/Shopify/shopify-app-template-remix/pull/1153) Use `ApiVersion.July25` rather than `LATEST_API_VERSION` in `.graphqlrc`.

## 2025.07.07
- [#1103](https://github.com/Shopify/shopify-app-template-remix/pull/1086) Remove deprecated .npmrc config values

## 2025.06.12
- [#1075](https://github.com/Shopify/shopify-app-template-remix/pull/1075) Add Shopify MCP to [VSCode configs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_enable-mcp-support-in-vs-code)

## 2025.06.12
-[#1082](https://github.com/Shopify/shopify-app-template-remix/pull/1082) Remove local Shopify CLI from the template. Developers should use the Shopify CLI [installed globally](https://shopify.dev/docs/api/shopify-cli#installation).
## 2025.03.18
-[#998](https://github.com/Shopify/shopify-app-template-remix/pull/998) Update to Vite 6

## 2025.03.01
- [#982](https://github.com/Shopify/shopify-app-template-remix/pull/982) Add Shopify Dev Assistant extension to the VSCode extension recommendations

## 2025.01.31
- [#952](https://github.com/Shopify/shopify-app-template-remix/pull/952) Update to Shopify App API v2025-01

## 2025.01.23

- [#923](https://github.com/Shopify/shopify-app-template-remix/pull/923) Update `@shopify/shopify-app-session-storage-prisma` to v6.0.0

## 2025.01.8

- [#923](https://github.com/Shopify/shopify-app-template-remix/pull/923) Enable GraphQL autocomplete for Javascript

## 2024.12.19

- [#904](https://github.com/Shopify/shopify-app-template-remix/pull/904) bump `@shopify/app-bridge-react` to latest
-
## 2024.12.18

- [875](https://github.com/Shopify/shopify-app-template-remix/pull/875) Add Scopes Update Webhook
## 2024.12.05

- [#910](https://github.com/Shopify/shopify-app-template-remix/pull/910) Install `openssl` in Docker image to fix Prisma (see [#25817](https://github.com/prisma/prisma/issues/25817#issuecomment-2538544254))
- [#907](https://github.com/Shopify/shopify-app-template-remix/pull/907) Move `@remix-run/fs-routes` to `dependencies` to fix Docker image build
- [#899](https://github.com/Shopify/shopify-app-template-remix/pull/899) Disable v3_singleFetch flag
- [#898](https://github.com/Shopify/shopify-app-template-remix/pull/898) Enable the `removeRest` future flag so new apps aren't tempted to use the REST Admin API.

## 2024.12.04

- [#891](https://github.com/Shopify/shopify-app-template-remix/pull/891) Enable remix future flags.

## 2024.11.26
- [888](https://github.com/Shopify/shopify-app-template-remix/pull/888) Update restResources version to 2024-10

## 2024.11.06

- [881](https://github.com/Shopify/shopify-app-template-remix/pull/881) Update to the productCreate mutation to use the new ProductCreateInput type

## 2024.10.29

- [876](https://github.com/Shopify/shopify-app-template-remix/pull/876) Update shopify-app-remix to v3.4.0 and shopify-app-session-storage-prisma to v5.1.5

## 2024.10.02

- [863](https://github.com/Shopify/shopify-app-template-remix/pull/863) Update to Shopify App API v2024-10 and shopify-app-remix v3.3.2

## 2024.09.18

- [850](https://github.com/Shopify/shopify-app-template-remix/pull/850) Removed "~" import alias

## 2024.09.17

- [842](https://github.com/Shopify/shopify-app-template-remix/pull/842) Move webhook processing to individual routes

## 2024.08.19

Replaced deprecated `productVariantUpdate` with `productVariantsBulkUpdate`

## v2024.08.06

Allow `SHOP_REDACT` webhook to process without admin context

## v2024.07.16

Started tracking changes and releases using calver

## Frame preview: true-size wall
- The preview stage is now a real-scale wall (default 12 ft × 9 ft, set by "Wall height shown" in the block settings). Every size is converted from inches to the wall, so 8×12 and 24×36 look exactly as big as they will in a room.
- Frame is always centred in the stage (fixes it sliding to the bottom and getting clipped).
- Width/height measurement lines on the frame, a foot ruler on the wall, and a 7 ft sofa + 5 ft 6 in person for scale (each can be turned off).
- Size buttons show cm under the inch label; caption gives cm/ft and an A4/A3/A2/A1 comparison.
- New "Close-up" toggle for seeing the art in detail (merchant room photo, if uploaded, shows here since it isn't to scale).
- Size labels in cm/mm/ft are understood as well as inches.

## Frame preview: room photo, orientation, buy from popup
- Real room photo (block setting): frames are drawn to scale on it using "Real width of the wall in the photo" and a hang point. The drawn wall stays as the fallback. Person silhouette now off by default.
- Portrait / Landscape toggle; the choice is saved on the order as a line item property (name configurable).
- Every product option is now selectable in the popup (not just size and colour), sold-out variants disable the buy buttons.
- Add to Cart and Buy Now inside the popup. Add to Cart uses the theme's own button so the cart drawer and counter update; Buy Now goes straight to checkout.
- Colour/size clicks only change the preview; Apply commits the variant to the page. Fires a `cqf:apply` event that themes can listen to (`data-cqf-listener`).
- Product art now always fills the frame, even when the theme sets `img { height: auto }`.
