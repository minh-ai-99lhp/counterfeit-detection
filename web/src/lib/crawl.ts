// Nhãn + màu cho trạng thái crawl, dùng chung giữa các tab của LazadaPage.
import type { CrawlControl, CrawlUrlStatus, Source, WorkerState } from "@/lib/types"

export function pickControl(s?: Source | null): CrawlControl | null {
  const c = s?.crawl_control
  if (!c) return null
  return Array.isArray(c) ? (c[0] ?? null) : c
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

export const URL_STATUS_META: Record<
  CrawlUrlStatus,
  { label: string; variant: BadgeVariant; className?: string }
> = {
  queued: { label: "Chờ xử lý", variant: "secondary" },
  processing: {
    label: "Đang xử lý",
    variant: "outline",
    className: "border-blue-500/50 text-blue-600 dark:text-blue-400",
  },
  done: {
    label: "Hoàn tất",
    variant: "outline",
    className: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  },
  dead_404: { label: "404", variant: "outline" },
  skipped_shell: { label: "Bỏ qua (shell)", variant: "outline" },
  error: { label: "Lỗi", variant: "destructive" },
}

export const URL_STATUS_ORDER: CrawlUrlStatus[] = [
  "processing",
  "queued",
  "done",
  "dead_404",
  "skipped_shell",
  "error",
]

export const WORKER_META: Record<
  WorkerState,
  { label: string; variant: BadgeVariant; className?: string }
> = {
  running: {
    label: "Đang chạy",
    variant: "outline",
    className: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
  },
  stopped: { label: "Đã dừng", variant: "secondary" },
  idle: { label: "Nghỉ", variant: "secondary" },
}

// Worker còn sống không? heartbeat trong vòng 30s coi như online.
export function isHeartbeatFresh(heartbeat_at: string | null, withinMs = 30_000): boolean {
  if (!heartbeat_at) return false
  return Date.now() - new Date(heartbeat_at).getTime() < withinMs
}

export function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  })
}
