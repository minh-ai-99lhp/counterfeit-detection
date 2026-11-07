// Kiểu dữ liệu khớp các bảng read-model trên Supabase (xem supabase/migrations/20260715000000_init.sql)

export type DesiredState = "running" | "stopped"
export type WorkerState = "running" | "stopped" | "idle"

export interface CrawlStats {
  seeded?: number
  queued?: number
  processing?: number
  fetched?: number
  live?: number
  dead_404?: number
  skipped_shell?: number
  error?: number
  saved?: number
  replaced?: number
}

export interface CrawlControl {
  source_id: string
  desired_state: DesiredState
  worker_state: WorkerState
  stats: CrawlStats
  last_seeded_at: string | null
  heartbeat_at: string | null
}

export interface Source {
  id: string
  slug: string
  name: string
  type: string
  enabled: boolean
  status_label: "active" | "coming_soon"
  icon: string | null
  sort_order: number
  config: Record<string, unknown>
  crawl_control?: CrawlControl | CrawlControl[] | null
}

export type CrawlUrlStatus =
  | "queued"
  | "processing"
  | "done"
  | "dead_404"
  | "skipped_shell"
  | "error"

export interface CrawlUrl {
  id: number
  source_id: string
  external_id: string
  url: string
  status: CrawlUrlStatus
  attempts: number
  error: string | null
  enqueued_at?: string
  updated_at: string
}

// Module 2 — CSDL Hàng thật (import từ nguồn công khai, xem worker/genuine_import.py)
export interface GenuineProduct {
  id: number
  rights_holder: string | null
  brand_name: string | null
  title: string | null
  sku: string | null
  image_urls: string[] | null
  primary_image_url: string | null
  is_authorized: boolean | null
  raw: {
    country?: string
    certificationName?: string[]
    [k: string]: unknown
  } | null
  created_at: string
}

export interface Post {
  id: number
  source_id: string
  external_id: string
  sku_id: string | null
  url: string
  title: string | null
  brand_name: string | null
  price_text: string | null
  price_value: number | null
  currency: string | null
  image_urls: string[] | null
  primary_image_url: string | null
  crawled_at: string
  last_seen_at: string
  // OCR (bóc chữ ảnh chính) — worker ghi qua module ocr_*
  ocr_status?: OcrStatus | null
  ocr_text?: string | null
  ocr_lines?: { text: string; conf?: number }[] | null
  ocr_at?: string | null
}

export type OcrStatus = "queued" | "done" | "no_text" | "error"
