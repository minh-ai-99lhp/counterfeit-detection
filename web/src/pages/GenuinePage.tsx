import { useCallback, useEffect, useState } from "react"
import {
  ImageOff,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { supabase } from "@/lib/supabase"
import type { GenuineProduct } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { GenuineDetailSheet } from "@/pages/GenuineDetailSheet"

const PAGE_SIZE = 20

interface Draft {
  title: string
  rights_holder: string
  brand_name: string
  sku: string
  country: string
  primary_image_url: string
  image_urls: string // mỗi dòng 1 URL
  certs: string // mỗi dòng 1 giấy chứng nhận
  is_authorized: boolean
}

const EMPTY_DRAFT: Draft = {
  title: "",
  rights_holder: "",
  brand_name: "",
  sku: "",
  country: "",
  primary_image_url: "",
  image_urls: "",
  certs: "",
  is_authorized: true,
}

function toDraft(p: GenuineProduct): Draft {
  return {
    title: p.title ?? "",
    rights_holder: p.rights_holder ?? "",
    brand_name: p.brand_name ?? "",
    sku: p.sku ?? "",
    country: p.raw?.country ?? "",
    primary_image_url: p.primary_image_url ?? "",
    image_urls: (p.image_urls ?? []).join("\n"),
    certs: (p.raw?.certificationName ?? []).join("\n"),
    is_authorized: p.is_authorized ?? true,
  }
}

function lines(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
}

function buildPayload(d: Draft, prevRaw: GenuineProduct["raw"] | null) {
  const image_urls = lines(d.image_urls)
  const certs = lines(d.certs)
  const country = d.country.trim()
  return {
    title: d.title.trim() || null,
    rights_holder: d.rights_holder.trim() || null,
    brand_name: d.brand_name.trim() || null,
    sku: d.sku.trim() || null,
    primary_image_url: d.primary_image_url.trim() || image_urls[0] || null,
    image_urls,
    is_authorized: d.is_authorized,
    raw: {
      ...(prevRaw ?? {}),
      country: country || undefined,
      certificationName: certs.length ? certs : undefined,
    },
  }
}

export function GenuinePage() {
  const [items, setItems] = useState<GenuineProduct[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // form (thêm/sửa)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<GenuineProduct | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  // xoá
  const [deleteTarget, setDeleteTarget] = useState<GenuineProduct | null>(null)
  const [deleting, setDeleting] = useState(false)

  // chi tiết
  const [detailTarget, setDetailTarget] = useState<GenuineProduct | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let q = supabase
      .from("genuine_products")
      .select("*", { count: "exact" })
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (search.trim()) {
      const term = `%${search.trim()}%`
      q = q.or(`title.ilike.${term},rights_holder.ilike.${term},sku.ilike.${term}`)
    }

    const { data, error, count } = await q
    if (error) setError(error.message)
    else {
      setItems((data as GenuineProduct[]) ?? [])
      setTotal(count ?? null)
    }
    setLoading(false)
  }, [page, search])

  useEffect(() => {
    load()
  }, [load])

  const pageCount = total != null ? Math.ceil(total / PAGE_SIZE) : null

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(0)
    setSearch(query)
  }

  function openCreate() {
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setSheetOpen(true)
  }

  function openEdit(p: GenuineProduct) {
    setEditing(p)
    setDraft(toDraft(p))
    setSheetOpen(true)
  }

  async function save() {
    if (!draft.title.trim()) {
      toast.error("Tên sản phẩm không được trống.")
      return
    }
    setSaving(true)
    const payload = buildPayload(draft, editing?.raw ?? null)
    const res = editing
      ? await supabase.from("genuine_products").update(payload).eq("id", editing.id)
      : await supabase.from("genuine_products").insert(payload)
    setSaving(false)

    if (res.error) {
      toast.error("Lưu thất bại: " + res.error.message)
      return
    }
    toast.success(editing ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.")
    setSheetOpen(false)
    if (!editing) setPage(0)
    await load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase
      .from("genuine_products")
      .delete()
      .eq("id", deleteTarget.id)
    setDeleting(false)
    if (error) {
      toast.error("Xoá thất bại: " + error.message)
      return
    }
    toast.success("Đã xoá sản phẩm.")
    setDeleteTarget(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <PackageCheck className="size-6 text-primary" />
            CSDL Hàng thật
          </h1>
          <p className="text-sm text-muted-foreground">
            Sản phẩm chính hãng đã công bố — mẫu chuẩn để đối chiếu.
            {total != null && (
              <>
                {" "}
                <span className="font-medium text-foreground">
                  {total.toLocaleString()}
                </span>{" "}
                sản phẩm.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tên, công ty, mã…"
                className="w-56 pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Tìm
            </Button>
          </form>
          <Button onClick={openCreate}>
            <Plus className="size-4" /> Thêm
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">
            Lỗi tải dữ liệu: {error}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Ảnh</TableHead>
              <TableHead>Tên sản phẩm</TableHead>
              <TableHead className="hidden md:table-cell">Công ty sở hữu</TableHead>
              <TableHead className="hidden lg:table-cell">Mã xác thực</TableHead>
              <TableHead className="hidden lg:table-cell">Quốc gia</TableHead>
              <TableHead className="text-center">CN</TableHead>
              <TableHead className="w-24 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : items.length === 0
                ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-12 text-center text-muted-foreground"
                      >
                        Không có sản phẩm nào khớp.
                      </TableCell>
                    </TableRow>
                  )
                : items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Thumb p={p} />
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(p)}
                          className="line-clamp-2 text-left font-medium hover:text-primary hover:underline"
                          title="Xem chi tiết"
                        >
                          {p.title ?? "—"}
                        </button>
                      </TableCell>
                      <TableCell className="hidden max-w-[16rem] md:table-cell">
                        <span className="line-clamp-2 text-sm text-muted-foreground">
                          {p.rights_holder ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">
                        {p.sku ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">
                        {p.raw?.country ?? "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {p.raw?.certificationName?.length ? (
                          <Badge variant="outline">
                            {p.raw.certificationName.length}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            onClick={() => openEdit(p)}
                            aria-label="Sửa"
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(p)}
                            aria-label="Xoá"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
          </TableBody>
        </Table>
      </Card>

      {pageCount != null && pageCount > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Trước
          </Button>
          <span className="text-sm text-muted-foreground">
            Trang <span className="font-medium text-foreground">{page + 1}</span> /{" "}
            {pageCount.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Sau
          </Button>
        </div>
      )}

      {/* Form thêm/sửa */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {editing ? "Sửa sản phẩm hàng thật" : "Thêm sản phẩm hàng thật"}
            </SheetTitle>
            <SheetDescription>
              {editing
                ? `ID #${editing.id}`
                : "Nhập thông tin sản phẩm chính hãng làm mẫu đối chiếu."}
            </SheetDescription>
          </SheetHeader>

          <div className="grid gap-4 px-4">
            <Field label="Tên sản phẩm *">
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Công ty sở hữu">
              <Input
                value={draft.rights_holder}
                onChange={(e) =>
                  setDraft({ ...draft, rights_holder: e.target.value })
                }
              />
            </Field>
            <Field label="Thương hiệu">
              <Input
                value={draft.brand_name}
                onChange={(e) => setDraft({ ...draft, brand_name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã xác thực">
                <Input
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                />
              </Field>
              <Field label="Quốc gia">
                <Input
                  value={draft.country}
                  onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Ảnh đại diện (URL)">
              <Input
                value={draft.primary_image_url}
                onChange={(e) =>
                  setDraft({ ...draft, primary_image_url: e.target.value })
                }
                placeholder="https://…"
              />
            </Field>
            <Field label="Danh sách ảnh (mỗi dòng 1 URL)">
              <Textarea
                value={draft.image_urls}
                rows={3}
                onChange={(e) => setDraft({ ...draft, image_urls: e.target.value })}
                placeholder="https://…"
              />
            </Field>
            <Field label="Giấy chứng nhận (mỗi dòng 1 mục)">
              <Textarea
                value={draft.certs}
                rows={3}
                onChange={(e) => setDraft({ ...draft, certs: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={draft.is_authorized}
                onChange={(e) =>
                  setDraft({ ...draft, is_authorized: e.target.checked })
                }
              />
              Đã được cấp phép / chính hãng
            </label>
          </div>

          <SheetFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? "Đang lưu…" : editing ? "Cập nhật" : "Thêm mới"}
            </Button>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Huỷ
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Chi tiết sản phẩm */}
      <GenuineDetailSheet
        product={detailTarget}
        open={detailTarget != null}
        onOpenChange={(o) => !o && setDetailTarget(null)}
      />

      {/* Xác nhận xoá */}
      <Dialog
        open={deleteTarget != null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá sản phẩm?</DialogTitle>
            <DialogDescription>
              Bạn sắp xoá vĩnh viễn “{deleteTarget?.title ?? "—"}”. Hành động này
              không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Huỷ
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Đang xoá…" : "Xoá"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Thumb({ p }: { p: GenuineProduct }) {
  const [broken, setBroken] = useState(false)
  return (
    <div className="flex size-12 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {p.primary_image_url && !broken ? (
        <img
          src={p.primary_image_url}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full object-contain"
        />
      ) : (
        <ImageOff className="size-4 text-muted-foreground" />
      )}
    </div>
  )
}
