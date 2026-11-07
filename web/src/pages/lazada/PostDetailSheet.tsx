import { useState } from "react"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Fingerprint,
  ImageOff,
  ScanText,
} from "lucide-react"

import type { Post } from "@/lib/types"
import { formatTime } from "@/lib/crawl"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function PostDetailSheet({
  post,
  open,
  onOpenChange,
}: {
  post: Post | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        {post && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8 leading-snug">
                {post.title ?? "(không có tiêu đề)"}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                #{post.id} · SKU {post.sku_id ?? "—"} · mã {post.external_id}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {/* Ảnh sản phẩm — gallery tương tác */}
              <Gallery key={post.id} post={post} />

              {/* Thông tin */}
              <div className="space-y-3 text-sm">
                <Field label="Thương hiệu">{post.brand_name ?? "—"}</Field>
                <Field label="Giá">
                  <span className="font-semibold text-foreground">
                    {post.price_text ??
                      (post.price_value != null
                        ? `${post.price_value.toLocaleString("vi-VN")} ${post.currency ?? ""}`
                        : "—")}
                  </span>
                </Field>
                <Field label="Thu thập lúc">{formatTime(post.crawled_at)}</Field>
                <Field label="Thấy gần nhất">{formatTime(post.last_seen_at)}</Field>
                <div>
                  <Button asChild size="sm" variant="outline">
                    <a href={post.url} target="_blank" rel="noreferrer">
                      Mở trên Lazada <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            </div>

            {/* Panel OCR — text bóc từ ảnh chính (module ocr_*) */}
            <OcrPanel post={post} />

            {/* Định danh & Đối sánh sản phẩm (Entity Resolution) — GLiNER2, sắp có */}
            <IdentityPanel />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function IdentityPanel() {
  const identity = ["category", "brand", "family", "variant"]
  const steps = ["Extract Identity", "Normalize", "Exact / Fuzzy Match"]
  return (
    <div className="mx-4 mb-6 rounded-lg border border-dashed p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Fingerprint className="size-4" /> Định danh & Đối sánh sản phẩm
        <Badge variant="secondary">Up coming</Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Trích xuất định danh có cấu trúc từ tiêu đề + text OCR bằng{" "}
        <a
          href="https://github.com/fastino-ai/GLiNER2"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          GLiNER2
        </a>
        , rồi đối sánh với CSDL hàng thật (Entity Resolution).
      </p>

      {/* Bộ định danh dự kiến */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {identity.map((k) => (
          <code
            key={k}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >
            {"{"}
            {k}
            {"}"}
          </code>
        ))}
      </div>

      {/* Pipeline 3 bước */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="rounded-full border bg-background px-2 py-0.5">{s}</span>
            {i < steps.length - 1 && (
              <ArrowRight className="size-3 text-muted-foreground" />
            )}
          </span>
        ))}
      </div>
    </div>
  )
}

function OcrPanel({ post }: { post: Post }) {
  const [copied, setCopied] = useState(false)
  const status = post.ocr_status ?? null

  async function copy() {
    if (!post.ocr_text) return
    const text = post.ocr_text
    try {
      // navigator.clipboard chỉ có trong secure context (HTTPS/localhost).
      // Mở UI qua HTTP bằng IP LAN/WSL → phải fallback execCommand.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement("textarea")
        ta.value = text
        ta.style.position = "fixed"
        ta.style.left = "-9999px"
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.error("Copy OCR thất bại:", e)
    }
  }

  return (
    <div className="mx-4 mb-6 rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <ScanText className="size-4" /> Chữ bóc từ ảnh (OCR)
        {status === "done" && (
          <Badge
            variant="outline"
            className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400"
          >
            {post.ocr_lines?.length ?? 0} dòng
          </Badge>
        )}
        {status === "done" && post.ocr_text && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={copy}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Đã chép" : "Chép"}
          </Button>
        )}
      </div>

      {status === "done" ? (
        <pre className="max-h-64 overflow-auto rounded bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
          {post.ocr_text}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">
          {status === "no_text"
            ? "Không phát hiện chữ trên ảnh."
            : status === "queued"
              ? "Đang chờ OCR trong hàng đợi…"
              : status === "error"
                ? `Lỗi OCR: ${post.ocr_text ?? "—"}`
                : "Chưa OCR ảnh này."}
        </p>
      )}
    </div>
  )
}

function Gallery({ post }: { post: Post }) {
  // Gộp ảnh chính + ảnh phụ, bỏ trùng, ảnh chính đứng đầu.
  const images = Array.from(
    new Set(
      [post.primary_image_url, ...(post.image_urls ?? [])].filter(
        (u): u is string => !!u
      )
    )
  )
  const [active, setActive] = useState(0)

  if (images.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border bg-muted text-muted-foreground">
        <ImageOff className="size-8" />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)]
  const many = images.length > 1
  const go = (dir: 1 | -1) =>
    setActive((i) => (i + dir + images.length) % images.length)

  return (
    <div className="space-y-2">
      <div className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
        <a href={current} target="_blank" rel="noreferrer" title="Mở ảnh gốc">
          <img
            src={current}
            alt={post.title ?? ""}
            className="size-full object-contain"
          />
        </a>
        {many && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute top-1/2 left-1 -translate-y-1/2 rounded-full bg-background/70 p-1 opacity-0 shadow transition-opacity hover:bg-background group-hover:opacity-100"
              aria-label="Ảnh trước"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full bg-background/70 p-1 opacity-0 shadow transition-opacity hover:bg-background group-hover:opacity-100"
              aria-label="Ảnh sau"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute right-2 bottom-2 rounded-full bg-background/80 px-2 py-0.5 text-xs tabular-nums text-foreground">
              {active + 1}/{images.length}
            </div>
          </>
        )}
      </div>
      {many && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((u, i) => (
            <button
              key={u}
              type="button"
              onClick={() => setActive(i)}
              className={
                "size-14 shrink-0 overflow-hidden rounded border bg-muted transition-all " +
                (i === active
                  ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "opacity-70 hover:opacity-100")
              }
              aria-label={`Ảnh ${i + 1}`}
            >
              <img src={u} alt="" className="size-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  )
}
