# Counterfeit Detection Platform

Demo platform that crawls e-commerce product listings, builds a database of genuine products, and prepares product matching to flag potential counterfeits.

| Module | Status |
|---|---|
| Marketplace crawler (Lazada) | ✅ |
| Genuine product database (import + CRUD) | ✅ |
| Product image OCR (Vietnamese) | ✅ |
| AI matching (entity extraction → product matching) | 🚧 skeleton |

## Architecture

```
React UI ──Play/Stop──► Supabase (Postgres · Realtime · Auth) ◄──writes── Python worker
                                                                            │
                     Seeder (sitemap) → Kafka → Consumer (fetch + parse) ───┤
                     Redis: dedup + in-flight tracking                      │
                     OCR seeder → Kafka → EasyOCR consumer ─────────────────┘
```

- **Control plane via database**: the UI sets `desired_state`; the worker polls it, reports state, stats and heartbeat. Progress shows live through Supabase Realtime.
- **Stop / resume** relies on Kafka consumer-group offsets. Writes are idempotent upserts on `(source_id, external_id)`.
- **Source-adapter pattern** (`worker/sources.py`) for multiple marketplaces. Shopee and TikTok Shop were surveyed and paused because of strong anti-bot protection.
- **OCR**: EasyOCR was chosen over PaddleOCR because PaddleOCR's recognizer covers only 23/67 Vietnamese accented characters (see `paddleocr-test/`).

## Tech stack

Python · Kafka · Redis · Playwright · EasyOCR · PostgreSQL / Supabase (RLS, Realtime, Auth) · React · TypeScript · Vite · Tailwind / shadcn-ui · Docker Compose

## Quick start

```bash
cp .env.example .env
make up          # Kafka, Redis and local Supabase (applies supabase/migrations)
make status      # print local Supabase URL and keys → fill in .env
make worker      # crawl supervisor
make web         # UI at http://localhost:5173
```

Create the first user in Supabase Studio (http://127.0.0.1:54323 → Authentication → Add user).

Optional jobs (from `worker/`):

```bash
python genuine_import.py --limit 200   # import genuine products (needs GENUINE_SOURCE_URL)
python ocr_run.py                      # OCR product images
```

## Project structure

```
worker/      crawler, Kafka seeder/consumer, OCR pipeline, genuine-product importer
web/         React dashboard
supabase/    database migrations and local config
infra/       docker-compose for Kafka and Redis
paddleocr-test/, gliner2-test/   OCR and entity-extraction experiments
```
