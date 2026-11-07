import { useEffect, useMemo, useState } from "react"
import { CircleDot, Loader2, Play, Square } from "lucide-react"

import { supabase } from "@/lib/supabase"
import type { CrawlControl, Source } from "@/lib/types"
import {
  WORKER_META,
  formatTime,
  isHeartbeatFresh,
  pickControl,
} from "@/lib/crawl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UrlsTab } from "./lazada/UrlsTab"
import { PostsTab } from "./lazada/PostsTab"

const SLUG = "lazada"

export function LazadaPage() {
  const [source, setSource] = useState<Source | null>(null)
  const [control, setControl] = useState<CrawlControl | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [now, setNow] = useState(Date.now())

  const sourceId = source?.id ?? null

  // Tải nguồn + control ban đầu
  useEffect(() => {
    supabase
      .from("sources")
      .select("*, crawl_control(*)")
      .eq("slug", SLUG)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else {
          const s = data as Source
          setSource(s)
          setControl(pickControl(s))
        }
        setLoading(false)
      })
  }, [])

  // Realtime: control (desired/worker state, stats, heartbeat) đổi liên tục
  useEffect(() => {
    if (!sourceId) return
    const channel = supabase
      .channel(`crawl_control:${sourceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "crawl_control",
          filter: `source_id=eq.${sourceId}`,
        },
        (payload) => setControl(payload.new as CrawlControl)
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [sourceId])

  // Nhịp đồng hồ để đánh giá heartbeat "còn sống" mỗi 5s
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000)
    return () => clearInterval(t)
  }, [])

  const isRunning = control?.desired_state === "running"
  const online = useMemo(
    () => isHeartbeatFresh(control?.heartbeat_at ?? null) && now > 0,
    [control?.heartbeat_at, now]
  )

  async function toggle() {
    if (!sourceId || pending) return
    const next = isRunning ? "stopped" : "running"
    setPending(true)
    // optimistic
    setControl((c) => (c ? { ...c, desired_state: next } : c))
    const { error } = await supabase
      .from("crawl_control")
      .update({ desired_state: next })
      .eq("source_id", sourceId)
    if (error) {
      setError(error.message)
      setControl((c) => (c ? { ...c, desired_state: isRunning ? "running" : "stopped" } : c))
    }
    setPending(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Đang tải Lazada…
      </div>
    )
  }

  if (error && !source) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="py-8 text-sm text-destructive">{error}</CardContent>
      </Card>
    )
  }

  const stats = control?.stats ?? {}
  const worker = control?.worker_state ?? "idle"
  const workerMeta = WORKER_META[worker] ?? WORKER_META.idle
  const seeded = stats.seeded ?? 0
  const fetched = stats.fetched ?? 0
  const progress = seeded > 0 ? Math.min(100, Math.round((fetched / seeded) * 100)) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <span>{source?.icon}</span> {source?.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Giám sát crawl và duyệt sản phẩm thu thập được.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDot
              className={
                online
                  ? "size-3.5 text-emerald-500"
                  : "size-3.5 text-muted-foreground/40"
              }
            />
            <span>{online ? "Worker online" : "Worker offline"}</span>
            <Badge variant={workerMeta.variant} className={workerMeta.className}>
              {workerMeta.label}
            </Badge>
          </div>
          <Button onClick={toggle} disabled={pending} variant={isRunning ? "destructive" : "default"}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isRunning ? (
              <Square className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
            {isRunning ? "Dừng" : "Chạy"}
          </Button>
        </div>
      </div>

      {/* Thanh tiến độ + thống kê */}
      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Tiến độ xử lý: {fetched.toLocaleString()} / {seeded.toLocaleString()} URL
              </span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Đã seed" value={stats.seeded ?? 0} />
            <Stat label="Chờ / đang" value={(stats.queued ?? 0) + (stats.processing ?? 0)} />
            <Stat label="Sản phẩm" value={stats.saved ?? 0} accent />
            <Stat label="404" value={stats.dead_404 ?? 0} />
            <Stat label="Bỏ qua" value={stats.skipped_shell ?? 0} />
            <Stat label="Lỗi" value={stats.error ?? 0} />
          </div>
          <div className="text-xs text-muted-foreground">
            Seed gần nhất: {formatTime(control?.last_seeded_at)} · Heartbeat:{" "}
            {formatTime(control?.heartbeat_at)}
          </div>
        </CardContent>
      </Card>

      {sourceId && (
        <Tabs defaultValue="posts">
          <TabsList>
            <TabsTrigger value="posts">Sản phẩm</TabsTrigger>
            <TabsTrigger value="urls">Đang xử lý</TabsTrigger>
          </TabsList>
          <TabsContent value="posts" className="mt-4">
            <PostsTab sourceId={sourceId} />
          </TabsContent>
          <TabsContent value="urls" className="mt-4">
            <UrlsTab sourceId={sourceId} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/40 p-2 text-center">
      <div
        className={
          "text-lg font-semibold tabular-nums " + (accent ? "text-primary" : "")
        }
      >
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
