This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Prototype (Stage 1 UI — no ML, no billing)

The **Field lab** is at **`/prototype`**. It is **client-only**: demo sign-in (sessionStorage), map + polygon draw, a **mock** acquisition stepper, and **example** weed GeoJSON (Epic 0.4 inference is not wired). **No payments**, **no live Airbus / OneAtlas orders**.

- **Sign-in**: **Supabase** sign-up with **admin approval** ([`docs/SUPABASE_AUTH.md`](docs/SUPABASE_AUTH.md)), or demo mode via `NEXT_PUBLIC_PROTO_EMAIL` / `NEXT_PUBLIC_PROTO_PASSWORD` when Supabase is not configured.
- **Map**: MapLibre + polygon draw, default view over California; **Run acquisition (mock)** requires the polygon centroid inside a California bounding box.
- **Agronomy panels**: live [Open-Meteo](https://open-meteo.com/) forecast + GDD from archive; NDVI chart is **demo data** only.

**Data acquisition (production) plan:** [docs/DATA_ACQUISITION_PIPELINE.md](docs/DATA_ACQUISITION_PIPELINE.md)

### Run locally

```bash
npm install
cp .env.example .env.local   # optional — change demo email/password
npm run dev
```

Open **`http://localhost:3000/prototype`** (local dev uses **no** `basePath`). GitHub Pages builds use `STATIC_EXPORT=1` and base path **`/WW-web`** — then use `https://<org>.github.io/WW-web/prototype/`.

### Preview (Cursor / VS Code) and the map

The Field lab uses **MapLibre (WebGL)**. The editor’s **Simple Browser** / embedded preview often **does not expose WebGL**, so the map looks empty. Use **“Open in Browser”** with Chrome, Firefox, or Safari while `npm run dev` is running.

If the map is still blank in a normal browser, try **`npm run dev:webpack`** (Webpack dev server instead of Turbopack) in case of a dev-bundler edge case.

### Preview a static build locally (same paths as GitHub Pages)

```bash
npm run preview:pages
```

Then open **`http://localhost:3000/WW-web/prototype/`** (note the **`/WW-web`** prefix — assets are emitted under that path).

### Preview production Node server (no `STATIC_EXPORT`)

```bash
npm run preview
```

Opens the app at **`http://localhost:3000/prototype`** (no `/WW-web` prefix).

To match CI output locally: `npm run build:static` then serve `out/` with any static file server.

### Troubleshooting

**Browser error `-102` (or “connection refused”)** means nothing is listening on that port — usually the dev server is not running or you are using the wrong port.

1. In the project folder, run **`npm run dev`** and wait until the terminal shows **“Ready”** (first compile can take a minute on synced folders).
2. If you see **`Port 3000 is in use … using … 3001`**, open **`http://localhost:3001/prototype`** instead (or free port 3000: quit the other app, or on macOS `lsof -i :3000` then stop that process).
3. If the command exits with an error, fix that first (e.g. run from a **local disk** clone if Google Drive causes timeouts — see below).

### Env vars

See [`.env.example`](.env.example).

### AWS / production considerations

See **[`PROTOTYPE_AWS.md`](PROTOTYPE_AWS.md)** and **[`docs/DATA_ACQUISITION_PIPELINE.md`](docs/DATA_ACQUISITION_PIPELINE.md)** for EC2/Batch/S3, webhooks, secrets, and moving beyond static export when the real API exists.

### Google Drive / synced folders

If the repo lives on **Google Drive** (or similar), `npm run build` may fail with `ETIMEDOUT` while reading `node_modules`. Clone or copy the project to a **local disk** (e.g. `~/dev/WW-web`), run `npm ci`, and build there.

---

## Getting Started (marketing site)

Run the development server:

```bash
npm run dev
```

Open **`http://localhost:3000`** with your browser.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) — your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy this Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
