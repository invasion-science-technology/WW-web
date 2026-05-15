# Data acquisition pipeline (plan)

This document describes how **production** would move from a user-drawn AOI to delivered imagery and a weed map. The current **Field lab** UI at `/prototype` only **simulates** these steps in the browser; it does not call Airbus OneAtlas or run ML inference (Epic 0.4).

## High-level flow

1. **Authenticate** — Real product: Supabase Auth or Cognito + JWT; not the demo email/password used locally.
2. **Persist AOI** — `POST /api/requests` stores GeoJSON polygon + user id in PostgreSQL (PostGIS).
3. **Token** — Backend exchanges API key for OAuth bearer token at `authenticate.foundation.api.oneatlas.airbus.com`.
4. **Feasibility** — `POST` feasibility for polygon + date window against a **neo** contract (Pléiades Neo).
5. **Attempts & price** — `GET` acquisition attempts, `GET` price for chosen attempt.
6. **Order** — `POST /orders` → `orderId`; store on request row.
7. **Poll / webhook** — Lambda (EventBridge schedule) polls `GET /orders/{orderId}` until `DELIVERED`, or receive provider webhook.
8. **Ingest** — Download DIMAP / GeoTIFF from OneAtlas workspace → **S3** raw bucket → virus scan (optional).
9. **Process** — **AWS Batch** job (Docker): GDAL orthorectify, clip to AOI, resample to 5 m, stack bands, run classifier → COG + GeoJSON + stats to S3 results bucket.
10. **Notify** — Update DB status, Supabase Realtime push to client, **SES / Resend** email with link.

## AWS dependencies (later deployment)

| Concern | AWS service | Role |
|--------|-------------|------|
| HTTPS API | API Gateway + **Lambda** or **ECS Fargate** | Next.js API routes or BFF for OneAtlas (keep API keys server-side). |
| Long jobs | **SQS** + **AWS Batch** | Queue ML jobs; Batch on **Spot** `c5.2xlarge` / `r5.2xlarge` for raster I/O. |
| Imagery | **S3** | Raw vendor delivery, COG outputs, lifecycle to IA/Glacier. |
| Polling | **EventBridge** → Lambda | Sync order status with OneAtlas. |
| Database | **RDS PostgreSQL** + PostGIS or managed **Supabase** | Requests, users, job state. |
| Secrets | **Secrets Manager** | OneAtlas client id/secret, webhook signing keys. |
| Observability | **CloudWatch** | Logs, metrics, alarms on job failures. |
| Egress | **CloudFront** (optional) | Tile or COG range GETs for map preview. |

**Not required for the static marketing site** — only when you add a real backend and stop using `output: "export"` for the app shell (or split marketing static vs. app on Vercel/Railway).

## I/O assumptions (Pléiades Neo via reseller)

- Delivery: DIMAP / JPEG2000 + metadata; orthorectification in your pipeline.
- RAM: uncompressed GeoTIFF can be **large**; use **Cloud-Optimized GeoTIFF (COG)** and windowed reads, or scale Batch vCPU + memory to AOI size.

## Environment variables (production sketch)

- `ONEATLAS_CLIENT_ID` / `ONEATLAS_CLIENT_SECRET` — server only.
- `DATABASE_URL` — Postgres connection.
- `S3_RAW_BUCKET`, `S3_RESULTS_BUCKET`
- `INTERNAL_WEBHOOK_SECRET` — verify callbacks.

## References

- Airbus OneAtlas Data tasking guides: `https://api.oneatlas.airbus.com/guides/oneatlas-data/g-tasking/`
- Apollo Mapping is quote-based; programmatic orders go through **OneAtlas** (or another provider API negotiated with TUH).
