import { useState } from "react"
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ScanText,
} from "lucide-react"

import type { GenuineProduct } from "@/lib/types"
import { formatTime } from "@/lib/crawl"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export function GenuineDetailSheet({
  product,
  open,
  onOpenChange,
}: {
  product: GenuineProduct | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const certs = product?.raw?.certificationName ?? []
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        {product && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="pr-8 leading-snug">
                {product.title ?? "(không có tên)"}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs">
                #{product.id} · mã {product.sku ?? "—"}
                {product.raw?.country ? ` · ${product.raw.country}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {/* Ảnh — gallery tương tác */}
              <Gallery key={product.id} product={product} />

              {/* Thông tin */}
              <div className="space-y-3 text-sm">
                <Field label="Công ty sở hữu">
                  <span className="font-medium text-foreground">
                    {product.rights_holder ?? "—"}
                  </span>
                </Field>
                <Field label="Thương hiệu">{product.brand_name ?? "—"}</Field>
                <Field label="Quốc gia">{product.raw?.country ?? "—"}</Field>
                <Field label="Trạng thái">
                  {product.is_authorized ? (
                    <Badge className="gap-1">
                      <BadgeCheck className="size-3.5" /> Chính hãng
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Chưa xác nhận</Badge>
                  )}
                </Field>
                <Field label="Thêm vào lúc">{formatTime(product.created_at)}</Field>
              </div>
            </div>

            {/* Giấy chứng nhận / công bố */}
            <div className="mx-4 mb-4">
              <div className="mb-2 text-sm font-medium">
                Giấy chứng nhận / công bố{" "}
                <span className="text-muted-foreground">({certs.length})</span>
              </div>
              {certs.length > 0 ? (
                <ul className="space-y-1.5">
                  {certs.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
                    >
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Không có giấy chứng nhận.
                </p>
              )}
            </div>

            {/* Panel đối chiếu — chừa sẵn cho module AI (giai đoạn sau) */}
            <div className="mx-4 mb-6 rounded-lg border border-dashed p-4">
              <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                <ScanText className="size-4" /> Đối chiếu với sản phẩm nghi ngờ
                <Badge variant="secondary">sắp có</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Khu vực hiển thị các bài đăng TMĐT bị nghi làm giả sản phẩm này và điểm
                nghi ngờ khi so khớp ảnh/tên (module 3).
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Gallery({ product }: { product: GenuineProduct }) {
  const images = Array.from(
    new Set(
      [product.primary_image_url, ...(product.image_urls ?? [])].filter(
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
            alt={product.title ?? ""}
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
