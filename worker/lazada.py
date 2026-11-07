"""Lazada: đọc sitemap + tải/parse trang chi tiết sản phẩm (PDP).

Logic đã kiểm chứng bằng thực nghiệm:
- Trang search/category bị anti-bot chặn → KHÔNG dùng.
- Sitemap `order-last-30days` cho danh sách URL (≈50% là 404, phải skip).
- PDP là server-rendered, dữ liệu nằm trong `var __moduleData__ = {...}`.
- Một số PDP dùng template JS rỗng (không có __moduleData__) → skip.
"""
import gzip
import json
import re
import time
import requests

from config import USER_AGENT, FETCH_RETRIES, SEED_MAX_SHARDS
from errors import NotFound, ShellPage  # noqa: F401 (re-export cho tương thích cũ)

_ITEM_ID = re.compile(r"i(\d+)\.html")
_session = requests.Session()
_session.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "vi-VN,vi;q=0.9"})


def _get(url, timeout=30):
    return _session.get(url, timeout=timeout)


def fetch_bytes(url, timeout=45):
    r = _get(url, timeout=timeout)
    r.raise_for_status()
    raw = r.content
    if raw[:2] == b"\x1f\x8b":  # gzip chưa được server giải nén
        raw = gzip.decompress(raw)
    return raw


def sitemap_shards(index_url):
    """Trả về danh sách URL shard con từ một sitemap index."""
    xml = fetch_bytes(index_url).decode("utf-8", "replace")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def shard_urls(shard_url):
    """Trả về danh sách URL sản phẩm trong một shard."""
    xml = fetch_bytes(shard_url).decode("utf-8", "replace")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def external_id_of(url):
    m = _ITEM_ID.search(url)
    return m.group(1) if m else None


def fetch_pdp(url):
    """Tải và parse 1 PDP. Ném NotFound(404) hoặc ShellPage. Trả dict field đã bóc."""
    last_exc = None
    for attempt in range(FETCH_RETRIES + 1):
        try:
            r = _get(url)
            if r.status_code == 404:
                raise NotFound(url)
            r.raise_for_status()
            html = r.text
            if "x5secdata" in html[:3000] or "_____tmd_____" in html[:3000]:
                raise ShellPage("anti-bot punish")
            if "var __moduleData__" not in html:
                raise ShellPage("no __moduleData__")
            return _parse_module(html, url)
        except (NotFound, ShellPage):
            raise
        except Exception as e:  # lỗi mạng/HTTP 000 → retry
            last_exc = e
            time.sleep(1.0 + attempt)
    raise last_exc


def _parse_module(html, url):
    i = html.index("var __moduleData__")
    s = html.index("{", i)
    data, _ = json.JSONDecoder().raw_decode(html[s:])
    f = data["data"]["root"]["fields"]

    tr = f.get("tracking", {}) or {}
    sku0 = (f.get("skuInfos") or {}).get("0", {}) or {}
    skus = (f.get("productOption", {}) or {}).get("skuBase", {}).get("skus", [{}]) or [{}]

    # ảnh: chỉ lấy list URL (tải về là bước sau)
    images = []
    for g in (f.get("skuGalleries") or {}).get("0", []) or []:
        src = g.get("src") or g.get("poster") or ""
        if src:
            images.append(("https:" + src) if src.startswith("//") else src)

    return {
        "external_id": skus[0].get("itemId") or external_id_of(url),
        "sku_id": (f.get("primaryKey") or {}).get("defaultSkuId"),
        "url": url,
        "title": (f.get("product") or {}).get("title"),
        "brand_name": tr.get("brand_name"),
        "brand_id": str(tr.get("brand_id")) if tr.get("brand_id") is not None else None,
        "price_text": tr.get("pdt_price"),
        "price_value": _price_to_number(tr.get("pdt_price")),
        "currency": "VND",
        "category_path": tr.get("pdt_category") or [],
        "leaf_category_id": str(sku0.get("categoryId")) if sku0.get("categoryId") else None,
        "reg_category_id": (tr.get("page") or {}).get("regCategoryId"),
        "seller_id": str(skus[0].get("sellerId")) if skus[0].get("sellerId") else None,
        "image_urls": images,
        "primary_image_url": images[0] if images else None,
        "raw": {"tracking": tr, "title": (f.get("product") or {}).get("title")},
    }


def _price_to_number(text):
    """'600.000 ₫' -> 600000.0"""
    if not text:
        return None
    digits = re.sub(r"[^\d]", "", text)
    return float(digits) if digits else None


# ─────────────────────────────────────────────────────────────
# Adapter: cắm vào seeder/consumer generic qua sources.get_adapter().
# ─────────────────────────────────────────────────────────────
class LazadaAdapter:
    """Nguồn Lazada — HTTP thuần (sitemap + PDP server-rendered). Không cần browser."""

    slug = "lazada"

    def open(self, log=print):
        pass  # HTTP thuần, không có tài nguyên cần mở

    def close(self):
        pass

    def iter_seed_items(self, limit, log=print):
        """Duyệt sitemap → yield {external_id, url}. Dedup/đếm do seeder lo."""
        import store  # tránh vòng import lúc nạp module
        with store.db().cursor() as cur:
            cur.execute("select config->>'sitemap_url' from sources where slug=%s", (self.slug,))
            index_url = cur.fetchone()[0]
        log(f"[lazada] sitemap index: {index_url}")
        shards = sitemap_shards(index_url)
        log(f"[lazada] {len(shards)} shard, duyệt tối đa {SEED_MAX_SHARDS}")
        for shard in shards[:SEED_MAX_SHARDS]:
            for url in shard_urls(shard):
                ext = external_id_of(url)
                if ext:
                    yield {"external_id": ext, "url": url}

    def fetch_post(self, item, log=print):
        return fetch_pdp(item["url"])
