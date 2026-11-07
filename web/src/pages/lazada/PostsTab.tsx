import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, ImageOff, Loader2, ScanText } from "lucide-react"

import { supabase } from "@/lib/supabase"
import type { Post } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { PostDetailSheet } from "./PostDetailSheet"

const PAGE_SIZE = 24

export function PostsTab({ sourceId }: { sourceId: string }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Post | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    supabase
      .from("posts")
      .select("*", { count: "exact" })
      .eq("source_id", sourceId)
      .order("crawled_at", { ascending: false })
      .range(from, to)
      .then(({ data, count }) => {
        if (!active) return
        setPosts((data as Post[]) ?? [])
        if (count != null) setTotal(count)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [sourceId, page])

  // Realtime: worker OCR ghi posts.ocr_* → merge vào post đang hiển thị (cờ hiện sống)
  useEffect(() => {
    const channel = supabase
      .channel(`posts:${sourceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "posts",
          filter: `source_id=eq.${sourceId}`,
        },
        (payload) => {
          const row = payload.new as Post
          const patch = (p: Post) =>
            p.id === row.id
              ? { ...p, ocr_status: row.ocr_status, ocr_text: row.ocr_text, ocr_lines: row.ocr_lines }
              : p
          setPosts((cur) => cur.map(patch))
          setSelected((cur) => (cur ? patch(cur) : cur))
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [sourceId])

  const totalPages = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null

  function openPost(p: Post) {
    setSelected(p)
    setOpen(true)
  }

  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Đang tải sản phẩm…
      </div>
    )
  }

  if (!loading && posts.length === 0 && page === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-16 text-center text-sm text-muted-foreground">
          Chưa có sản phẩm nào được lưu. Chạy crawl để thu thập từ Lazada.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total != null && (
            <>
              <span className="font-medium text-foreground">{total.toLocaleString()}</span>{" "}
              sản phẩm
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground">
            {page + 1}
            {totalPages != null && ` / ${totalPages}`}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || (totalPages != null && page + 1 >= totalPages)}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {posts.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => openPost(p)}
            className="group overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="relative aspect-square overflow-hidden bg-muted">
              {p.primary_image_url ? (
                <img
                  src={p.primary_image_url}
                  alt={p.title ?? ""}
                  loading="lazy"
                  className="size-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-6" />
                </div>
              )}
              {p.ocr_status === "done" && (
                <span
                  className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
                  title="Đã bóc chữ (OCR)"
                >
                  <ScanText className="size-3" /> OCR
                </span>
              )}
            </div>
            <div className="space-y-1 p-2">
              <div className="line-clamp-2 text-xs leading-snug" title={p.title ?? ""}>
                {p.title ?? "(không có tiêu đề)"}
              </div>
              {p.brand_name && (
                <div className="truncate text-[11px] text-muted-foreground">
                  {p.brand_name}
                </div>
              )}
              <div className="text-sm font-semibold text-primary">
                {p.price_text ??
                  (p.price_value != null
                    ? `${p.price_value.toLocaleString("vi-VN")}₫`
                    : "")}
              </div>
            </div>
          </button>
        ))}
      </div>

      <PostDetailSheet post={selected} open={open} onOpenChange={setOpen} />
    </div>
  )
}
