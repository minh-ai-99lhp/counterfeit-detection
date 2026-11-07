"""Nguồn Shopee — crawl qua headless browser (Playwright).

Vì sao không dùng HTTP thuần như Lazada (đã khảo sát thực nghiệm):
  - Không có sitemap thật; PDP là client-side render (data không nằm trong HTML).
  - API v4 (search_items / pdp/get_pc) trả 403 error 90309999 vì đòi header
    `af-ac-enc-dat` (fingerprint mã hoá do JS Shopee sinh).
→ Mở trang bằng browser thật, để SPA Shopee tự gọi API, ta BẮT response JSON.

Seed: trang chủ → đọc link category (a[href*="-cat."]) → mỗi category duyệt trang
sản phẩm MỚI NHẤT (sortBy=ctime), bắt response search_items → yield {shopid.itemid}.
Chạy lại làm y hệt; Redis dedup ở seeder bỏ trùng → chỉ nhặt sản phẩm mới.

Shopee CHẶN headless + BẮT đăng nhập → chạy headful, dùng persistent profile đã login.
Đăng nhập 1 lần (cần màn hình — WSLg hiện cửa sổ):
  python shopee.py login                      # đăng nhập, lưu session vào profile

CLI probe (không cần Kafka/Redis) để verify sớm — bọc `xvfb-run -a` nếu server không màn hình:
  python shopee.py categories                 # liệt kê category bắt được từ trang chủ
  python shopee.py seed --limit 20            # in danh sách {external_id,url}
  python shopee.py pdp <shopid>.<itemid>      # in post dict đã map
"""
import re
import sys

from browser import Browser
from errors import NotFound, Blocked
from config import SHOPEE_SEED_CATEGORIES, SHOPEE_SEED_PAGES

HOME = "https://shopee.vn/"
IMG_BASE = "https://down-vn.img.susercontent.com/"
_CAT_HREF = re.compile(r"-cat\.[\d.]+")
_EXT = re.compile(r"^(\d+)\.(\d+)$")   # external_id = "{shopid}.{itemid}"


def _is_item_list(url):
    return "search_items" in url or "/recommend" in url


def _is_pdp(url):
    return "/pdp/get_pc" in url or "/item/get" in url


def product_url(shopid, itemid):
    return f"https://shopee.vn/product/{shopid}/{itemid}"


class ShopeeAdapter:
    slug = "shopee"

    def __init__(self):
        self.browser = None

    # ── vòng đời ─────────────────────────────────────────────
    # Shopee phát hiện & chặn browser headless (redirect /verify/traffic) và BẮT
    # ĐĂNG NHẬP mới cho duyệt → luôn chạy headful, dùng persistent profile đã login.
    # Chạy trên server không màn hình: bọc `xvfb-run -a` (WSL có sẵn WSLg/xvfb).
    def open(self, log=print):
        if self.browser is None:
            log("[shopee] mở browser (headful) + warm-up trang chủ…")
            self.browser = Browser(headless=False)
            self.browser.start()
            self.browser.warm_up(HOME)
            if self.browser.looks_blocked():
                raise Blocked("Bị chặn ở warm-up — profile chưa đăng nhập? "
                              "Chạy `python shopee.py login` để đăng nhập 1 lần.")

    def close(self):
        if self.browser:
            self.browser.close()
            self.browser = None

    # ── seed ─────────────────────────────────────────────────
    def category_urls(self, log=print):
        """Đọc trang chủ → danh sách URL category (a[href*='-cat.'])."""
        self.open(log)
        page = self.browser.page
        page.goto(HOME, wait_until="domcontentloaded")
        page.wait_for_timeout(3000)
        hrefs = page.eval_on_selector_all(
            "a[href*='-cat.']", "els => els.map(e => e.href)")
        seen, urls = set(), []
        for h in hrefs:
            m = _CAT_HREF.search(h or "")
            if not m:
                continue
            base = h.split("?")[0]
            if base not in seen:
                seen.add(base)
                urls.append(base)
        log(f"[shopee] tìm thấy {len(urls)} category trên trang chủ")
        return urls

    def iter_seed_items(self, limit, log=print):
        self.open(log)
        cats = self.category_urls(log)[:SHOPEE_SEED_CATEGORIES]
        emitted = 0
        for cat_url in cats:
            for pg in range(SHOPEE_SEED_PAGES):
                sep = "&" if "?" in cat_url else "?"
                nav = f"{cat_url}{sep}page={pg}&sortBy=ctime"
                try:
                    data = self.browser.capture_json(nav, _is_item_list)
                except Blocked as e:
                    log(f"[shopee] bỏ qua {nav}: {e}")
                    break  # sang category khác
                items = _extract_items(data)
                if not items:
                    break
                for shopid, itemid in items:
                    yield {"external_id": f"{shopid}.{itemid}",
                           "url": product_url(shopid, itemid)}
                    emitted += 1
                    if emitted >= limit:
                        return

    # ── fetch PDP ────────────────────────────────────────────
    def fetch_post(self, item, log=print):
        self.open(log)
        m = _EXT.match(item["external_id"])
        if not m:
            raise NotFound(f"external_id không hợp lệ: {item['external_id']}")
        shopid, itemid = m.group(1), m.group(2)
        data = self.browser.capture_json(product_url(shopid, itemid), _is_pdp)
        node = _pdp_item(data)
        if not node:
            raise NotFound(item["external_id"])
        return _map_post(node, shopid, itemid, item["url"])


# ── parse helpers (tolerant với vài biến thể shape) ──────────────────────────
def _extract_items(data):
    """→ list[(shopid, itemid)] từ response search_items / recommend."""
    out = []
    items = (data or {}).get("items") or (data or {}).get("data", {}).get("items") or []
    for it in items:
        b = it.get("item_basic") or it.get("item") or it
        sid, iid = b.get("shopid") or b.get("shop_id"), b.get("itemid") or b.get("item_id")
        if sid and iid:
            out.append((sid, iid))
    return out


def _pdp_item(data):
    """→ node sản phẩm từ response get_pc (bọc data.item hoặc item)."""
    if not data:
        return None
    if data.get("error"):
        return None
    d = data.get("data") or data
    return d.get("item") or (d if d.get("itemid") or d.get("item_id") else None)


def _map_post(it, shopid, itemid, url):
    images = [IMG_BASE + h for h in (it.get("images") or []) if h]
    primary = (IMG_BASE + it["image"]) if it.get("image") else (images[0] if images else None)
    price_micro = it.get("price") or it.get("price_min")
    price_value = round(price_micro / 100000, 2) if price_micro else None
    cats = it.get("categories") or []
    return {
        "external_id": f"{shopid}.{itemid}",
        "sku_id": None,
        "url": url,
        "title": it.get("title") or it.get("name"),
        "brand_name": it.get("brand") or None,
        "brand_id": str(it["brand_id"]) if it.get("brand_id") else None,
        "price_text": f"{int(price_value):,} ₫".replace(",", ".") if price_value else None,
        "price_value": price_value,
        "currency": "VND",
        "category_path": [c.get("display_name") for c in cats if c.get("display_name")],
        "leaf_category_id": str(cats[-1].get("catid")) if cats and cats[-1].get("catid") else None,
        "reg_category_id": None,
        "seller_id": str(shopid),
        "image_urls": images or ([primary] if primary else []),
        "primary_image_url": primary,
        "raw": {"title": it.get("title"), "brand": it.get("brand"),
                "price": price_micro, "shopid": shopid, "itemid": itemid,
                "categories": cats},
    }


# ── CLI probe ────────────────────────────────────────────────────────────────
def _login(log=print):
    """Mở browser HIỂN THỊ để user đăng nhập 1 lần; session lưu vào persistent profile.

    Cần màn hình (WSLg DISPLAY=:0 hiện cửa sổ trên Windows). KHÔNG bọc xvfb-run.
    """
    b = Browser(headless=False, block_media=False)
    b.start()
    b.page.goto("https://shopee.vn/buyer/login", wait_until="domcontentloaded")
    log("→ Cửa sổ Shopee đã mở. Đăng nhập (điện thoại/mật khẩu/OTP) tới khi thấy trang chủ.")
    input("   Đăng nhập XONG thì bấm Enter ở đây để lưu session… ")
    b.page.goto(HOME, wait_until="domcontentloaded")
    b.page.wait_for_timeout(2000)
    ok = "/verify/" not in b.page.url
    log(f"   URL hiện tại: {b.page.url[:80]} → {'OK, đã đăng nhập' if ok else 'VẪN bị chặn, thử lại'}")
    b.close()


def _main(argv):
    import json
    cmd = argv[0] if argv else "categories"
    if cmd == "login":
        _login()
        return
    ad = ShopeeAdapter()
    try:
        if cmd == "categories":
            for u in ad.category_urls():
                print(u)
        elif cmd == "seed":
            limit = 20
            if "--limit" in argv:
                limit = int(argv[argv.index("--limit") + 1])
            for i, item in enumerate(ad.iter_seed_items(limit), 1):
                print(i, item)
        elif cmd == "pdp":
            ext = argv[1]
            post = ad.fetch_post({"external_id": ext, "url": product_url(*ext.split("."))})
            print(json.dumps(post, ensure_ascii=False, indent=2))
        else:
            print(__doc__)
    finally:
        ad.close()


if __name__ == "__main__":
    _main(sys.argv[1:])
