import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"

import { supabase } from "@/lib/supabase"
import type { CrawlUrl, CrawlUrlStatus } from "@/lib/types"
import { URL_STATUS_META, URL_STATUS_ORDER, formatTime } from "@/lib/crawl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PAGE_LIMIT = 300

export function UrlsTab({ sourceId }: { sourceId: string }) {
  const [rows, setRows] = useState<CrawlUrl[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<CrawlUrlStatus | "all">("all")
  const rowsRef = useRef<CrawlUrl[]>([])
  rowsRef.current = rows

  // Tải danh sách ban đầu
  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from("crawl_urls")
      .select("*")
      .eq("source_id", sourceId)
      .order("updated_at", { ascending: false })
      .limit(PAGE_LIMIT)
      .then(({ data }) => {
        if (!active) return
        setRows((data as CrawlUrl[]) ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [sourceId])

  // Realtime: chèn/cập nhật crawl_urls → gộp vào đầu danh sách
  useEffect(() => {
    const channel = supabase
      .channel(`crawl_urls:${sourceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crawl_urls",
          filter: `source_id=eq.${sourceId}`,
        },
        (payload) => {
          const row = payload.new as CrawlUrl
          if (!row?.id) return
          const next = rowsRef.current.filter((r) => r.id !== row.id)
          next.unshift(row)
          setRows(next.slice(0, PAGE_LIMIT))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [sourceId])

  const counts = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, [rows])

  const visible = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Đang tải URL…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Tất cả <span className="ml-1 tabular-nums opacity-70">{rows.length}</span>
        </FilterChip>
        {URL_STATUS_ORDER.map((s) => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {URL_STATUS_META[s].label}
            <span className="ml-1 tabular-nums opacity-70">{counts[s] ?? 0}</span>
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Chưa có URL nào ở trạng thái này. Bấm <b>Play</b> để bắt đầu thu thập.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="hidden w-[110px] md:table-cell">Mã SP</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-[130px]">Trạng thái</TableHead>
                <TableHead className="hidden w-[60px] text-center sm:table-cell">
                  Lần
                </TableHead>
                <TableHead className="w-[130px]">Cập nhật</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const meta = URL_STATUS_META[r.status] ?? {
                  label: r.status,
                  variant: "secondary" as const,
                }
                return (
                  <TableRow key={r.id}>
                    <TableCell className="hidden truncate font-mono text-xs text-muted-foreground md:table-cell">
                      {r.external_id}
                    </TableCell>
                    <TableCell className="overflow-hidden">
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-1 text-sm text-primary hover:underline"
                        title={r.url}
                      >
                        <span className="truncate">{r.url}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-60" />
                      </a>
                      {r.error && (
                        <div className="truncate text-xs text-destructive" title={r.error}>
                          {r.error}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={meta.variant} className={meta.className}>
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-center tabular-nums text-sm sm:table-cell">
                      {r.attempts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(r.updated_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Hiển thị tối đa {PAGE_LIMIT} URL mới nhất · cập nhật trực tiếp qua Realtime.
      </p>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      className="h-7 rounded-full px-3 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
