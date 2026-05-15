# WeedWatch AI prototype — AWS & hosting notes

This document complements the Stage 1 **local** prototype in `app/prototype/`. It sketches how the same product surface could move from **static GitHub Pages** (`output: "export"` when `STATIC_EXPORT=1` in [`next.config.ts`](next.config.ts)) to a **production** stack with real tasking, optional billing webhooks, and GeoTIFF-heavy workloads.

**Acquisition pipeline (OneAtlas → S3 → Batch):** see [`docs/DATA_ACQUISITION_PIPELINE.md`](docs/DATA_ACQUISITION_PIPELINE.md).

## Current prototype constraints

- **No Epic 0.4 ML inference** — weed polygons are **example GeoJSON** synthesized client-side.
- **No billing** in the Field lab UI.
- **Demo sign-in** uses `NEXT_PUBLIC_PROTO_EMAIL` / `NEXT_PUBLIC_PROTO_PASSWORD` checked in the browser (`sessionStorage`). Fine for local demos only; production must use **Supabase Auth**, **Amazon Cognito**, or similar with server-validated sessions.

## Hosting models

### A. Static front-end (current CI path)

- **Build**: `next build` → static assets in `out/`.
- **Host**: **Amazon S3** + **CloudFront** (or GitHub Pages as today).
- **Pros**: cheap, simple CDN, no Node runtime to patch.
- **Cons**: no Route Handlers / SSR / secure Stripe session minting unless you add another compute tier.

### B. Full Next.js on AWS

- **Amazon ECS on Fargate** or **EC2** behind an **Application Load Balancer**.
- Remove `output: "export"` when you need Route Handlers (`app/api/...`) for Stripe (`POST /api/checkout/session`, `POST /api/webhooks/stripe`), NDVI tile proxies, etc.
- Store secrets in **AWS Secrets Manager** or **SSM Parameter Store**; inject into task definitions or EC2 userdata.

### C. Split: marketing static + app serverless

- Marketing site stays static on S3/CloudFront (`/`).
- App subdomain (`app.weedwatch.ai`) on **Vercel**, **ECS**, or **Lambda + Function URLs** for APIs only.

## Stripe (production)

1. Create **Products / Prices** for credit packs or per-field pricing.
2. For Checkout without maintaining Payment Links manually, expose **`POST /api/checkout/session`** that uses `STRIPE_SECRET_KEY`.
3. Register **`POST /api/webhooks/stripe`** (HTTPS) in the Stripe Dashboard; verify signatures with `STRIPE_WEBHOOK_SECRET`.
4. Grant credits or unlock jobs **only after** webhook verification — never trust client-side toggles.

## MapLibre GL JS

- The prototype uses MapLibre’s **demonstration style** (`demotiles.maplibre.org`) — **no Mapbox token**.
- Production usually swaps to **MapTiler**, **MapLibre composite tiles**, or **self-hosted raster/vector tiles**.
- If layers pull from your **own S3 bucket**, configure **CORS** (`AllowedOrigin`, `AllowedMethod GET/HEAD`) and CloudFront **Origin Access Control**.

## Open-Meteo

- Called directly from the browser today (HTTPS + CORS-friendly).
- Heavy usage may warrant caching (**CloudFront** in front of your API wrapper) or moving calls to **Lambda**/**ECS** with quotas.

## Raster / ML pipeline (later Epic 0.4+)

- **Input stacks**: raw airborne/satellite GeoTIFFs in **S3** with versioning & lifecycle rules (IA/Glacier for archives).
- **Processing**: **AWS Batch** (GPU optional) or containers on **ECS**; coordinate via **SQS** / **Step Functions**.
- **Outputs**: COGs + sparse vectors back to S3; tile endpoints via **CloudFront** + **Lambda@Edge** or a dedicated tile server.

## Auth

| Approach | Where it fits |
| --- | --- |
| **Supabase Auth** | Fast iteration; Postgres + RLS + storage in one product; good if you already planned Supabase in the roadmap. |
| **Amazon Cognito** | Native AWS IAM integration; pairs cleanly with ALB authorizers or API Gateway. |

For either option, issue **short-lived JWTs**, validate on the server for paid actions, and avoid mirroring billing state only in `localStorage`.

## Secrets checklist

| Variable | Typical storage |
| --- | --- |
| `STRIPE_SECRET_KEY`, webhook secret | Secrets Manager |
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets Manager |
| Airbus / ordering API keys | Secrets Manager |
| Public anon keys (`NEXT_PUBLIC_*`) | Build-time env in CI (not secret) |

## Base path (`/WW-web`)

GitHub Pages serves this repo under **`/WW-web`**. CI sets `STATIC_EXPORT=1` and `NEXT_PUBLIC_BASE_PATH=/WW-web` so static assets resolve. Local **`npm run dev`** uses **no** `basePath` — use `http://localhost:3000/`. To mimic Pages paths locally, run **`npm run preview:pages`** and open **`http://localhost:3000/WW-web/`**. Production on a dedicated apex domain usually drops the prefix — adjust [`next.config.ts`](next.config.ts) per environment.
