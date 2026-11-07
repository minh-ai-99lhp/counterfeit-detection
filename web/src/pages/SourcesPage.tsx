import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react"

import { supabase } from "@/lib/supabase"
import type { CrawlControl, Source } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

function control(s: Source): CrawlControl | null {
  const c = s.crawl_control
  if (!c) return null
  return Array.isArray(c) ? (c[0] ?? null) : c
}

export function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from("sources")
      .select("*, crawl_control(*)")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setSources((data as Source[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tổng quan nguồn</h1>
        <p className="text-sm text-muted-foreground">
          Các sàn TMĐT được giám sát. Chọn một nguồn để xem tiến độ crawl và sản phẩm.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Đang tải nguồn…
        </div>
      )}

      {error && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Lỗi kết nối Supabase</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => {
          const c = control(s)
          const active = s.status_label === "active"
          const stats = c?.stats ?? {}
          const note =
            typeof s.config?.status_note === "string" ? s.config.status_note : null
          return (
            <Card key={s.id} className={active ? "" : "opacity-70"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {s.icon && <span className="text-xl leading-none">{s.icon}</span>}
                    {s.name}
                  </CardTitle>
                  <Badge variant={active ? "default" : "secondary"}>
                    {active ? "Đang chạy" : "Sắp có"}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">{s.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {active ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <Stat label="Sản phẩm" value={stats.saved ?? 0} />
                      <Stat label="404" value={stats.dead_404 ?? 0} />
                      <Stat label="Đã xử lý" value={stats.fetched ?? 0} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Worker:{" "}
                        <span className="font-medium text-foreground">
                          {c?.worker_state ?? "—"}
                        </span>
                      </span>
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/${s.slug}`}>
                          Mở <ArrowRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : note ? (
                  <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nguồn này sẽ được bổ sung ở giai đoạn sau.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-2">
      <div className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  )
}
