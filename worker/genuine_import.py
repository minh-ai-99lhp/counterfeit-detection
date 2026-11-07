"""Importer CSDL Hàng thật từ nguồn công khai (GENUINE_SOURCE_URL) → bảng genuine_products.

Khác luồng crawl Lazada: API nguồn phân trang sạch, KHÔNG cần Kafka/Redis/sitemap.
  - Danh sách: POST /services/api/Products/SearchList (không cần auth), total ~1.09M,
    pageSize không bị cap, items sort ổn định theo id.
  - Ảnh:       {GENUINE_SOURCE_URL}/services/ + item.media.url  (base /services/, KHÔNG /api).

Chạy:  python3 genuine_import.py                 # import toàn bộ
       python3 genuine_import.py --limit 200     # thử nhanh
       python3 genuine_import.py --page-size 500 --start-page 1
Upsert idempotent theo sku(=maXacThuc) — chạy lại an toàn, đè bản mới nhất.
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

import psycopg
from psycopg.types.json import Jsonb

from config import GENUINE_SOURCE_URL, SUPABASE_DB_URL, USER_AGENT

API = f"{GENUINE_SOURCE_URL}/services/api/Products/SearchList"
IMG_BASE = f"{GENUINE_SOURCE_URL}/services/"

UPSERT = """
insert into genuine_products
    (rights_holder, brand_name, title, sku, image_urls, primary_image_url, raw)
values
    (%(rights_holder)s, %(brand_name)s, %(title)s, %(sku)s,
     %(image_urls)s, %(primary_image_url)s, %(raw)s)
on conflict (sku) where sku is not null do update set
    rights_holder     = excluded.rights_holder,
    brand_name        = excluded.brand_name,
    title             = excluded.title,
    image_urls        = excluded.image_urls,
    primary_image_url = excluded.primary_image_url,
    raw               = excluded.raw
"""


def fetch(page: int, size: int, retries: int = 3) -> dict:
    body = json.dumps({
        "keyword": "", "standard": [], "origin": "", "userId": "",
        "type": 0, "page": page, "pageSize": size, "isLikedOnly": False,
    }).encode()
    req = urllib.request.Request(API, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Origin": GENUINE_SOURCE_URL,
        "Referer": f"{GENUINE_SOURCE_URL}/san-pham",
        "User-Agent": USER_AGENT,
    })
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.load(resp)
            if not data.get("isSuccess"):
                raise RuntimeError(data.get("message", "isSuccess=false"))
            return data["result"]
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def img_url(media) -> str | None:
    if not media or not media.get("url"):
        return None
    path = media["url"].lstrip("/")
    return IMG_BASE + urllib.parse.quote(path, safe="/")  # giữ '/', encode dấu + space


def to_row(item: dict) -> dict:
    img = img_url(item.get("media"))
    return {
        "rights_holder": item.get("companyName"),
        "brand_name": item.get("companyName"),
        "title": item.get("productName"),
        "sku": item.get("maXacThuc"),
        "image_urls": [img] if img else [],
        "primary_image_url": img,
        "raw": Jsonb(item),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--page-size", type=int, default=500)
    ap.add_argument("--start-page", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0, help="tối đa N sản phẩm (0 = tất cả)")
    ap.add_argument("--delay", type=float, default=0.3, help="giây nghỉ giữa 2 trang")
    args = ap.parse_args()

    if not GENUINE_SOURCE_URL:
        sys.exit("[!] Chưa cấu hình GENUINE_SOURCE_URL trong .env")
    conn = psycopg.connect(SUPABASE_DB_URL, connect_timeout=30)  # autocommit off → commit/trang
    page = args.start_page
    total = None
    imported = 0
    t0 = time.time()

    try:
        while True:
            result = fetch(page, args.page_size)
            if total is None:
                total = result.get("total")
                print(f"total nguồn = {total:,} sản phẩm | page-size={args.page_size}", flush=True)
            items = result.get("items", [])
            if not items:
                break

            rows = [to_row(it) for it in items]
            with conn.cursor() as cur:
                cur.executemany(UPSERT, rows)
            conn.commit()

            imported += len(items)
            rate = imported / max(time.time() - t0, 1e-6)
            print(f"page {page:>5}: +{len(items):<4} → {imported:>8,} "
                  f"({rate:6.0f}/s)", flush=True)

            if args.limit and imported >= args.limit:
                break
            if total and imported >= total:
                break
            page += 1
            time.sleep(args.delay)
    finally:
        conn.close()

    print(f"XONG: {imported:,} sản phẩm trong {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())
