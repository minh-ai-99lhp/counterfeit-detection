"""Cấu hình worker — đọc từ .env ở gốc project."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# Supabase (worker ghi trực tiếp Postgres bằng service-role qua session pooler)
SUPABASE_DB_URL = os.environ["SUPABASE_DB_URL"]

# Nguồn CSDL hàng thật (public API) — dùng bởi genuine_import.py, không hardcode domain
GENUINE_SOURCE_URL = os.getenv("GENUINE_SOURCE_URL", "").rstrip("/")

# Hạ tầng local
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "localhost:9092")
REDIS_URL       = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Nguồn dữ liệu — 1 process = 1 nguồn (chọn qua SOURCE_SLUG).
# Topic/group mặc định suy ra theo slug để chạy nhiều nguồn song song không phải
# set tay từng biến (lazada.crawl.urls / lazada-crawler, shopee.crawl.urls / ...).
SOURCE_SLUG   = os.getenv("SOURCE_SLUG", "lazada")
KAFKA_TOPIC   = os.getenv("KAFKA_TOPIC", f"{SOURCE_SLUG}.crawl.urls")
KAFKA_GROUP   = os.getenv("KAFKA_GROUP", f"{SOURCE_SLUG}-crawler")

# Điều tiết
SEED_MAX_URLS   = int(os.getenv("SEED_MAX_URLS", "2000"))   # số URL mới tối đa mỗi lần seed
SEED_MAX_SHARDS = int(os.getenv("SEED_MAX_SHARDS", "1"))    # số shard sitemap duyệt mỗi lần seed (Lazada)
FETCH_DELAY     = float(os.getenv("FETCH_DELAY", "1.5"))    # giây giữa 2 request PDP
FETCH_RETRIES   = int(os.getenv("FETCH_RETRIES", "2"))
CONTROL_POLL    = float(os.getenv("CONTROL_POLL", "2.0"))   # giây poll crawl_control

USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

# ── Khung headless-browser (nguồn browser-based: Shopee, backup Lazada…) ──────
# Playwright chạy persistent context để giữ cookie/anti-bot token qua các lần chạy.
HEADLESS           = os.getenv("HEADLESS", "true").lower() not in ("0", "false", "no")
BROWSER_PROXY      = os.getenv("BROWSER_PROXY") or None       # vd http://user:pass@host:port
BROWSER_PROFILE_DIR = os.getenv("BROWSER_PROFILE_DIR",
                                str(Path(__file__).resolve().parent / f".pw-profile-{SOURCE_SLUG}"))
NAV_TIMEOUT        = float(os.getenv("NAV_TIMEOUT", "45000"))  # ms cho 1 navigation/response
BROWSER_BLOCK_MEDIA = os.getenv("BROWSER_BLOCK_MEDIA", "true").lower() not in ("0", "false", "no")

# ── Shopee (seed theo category → sản phẩm mới nhất) ──────────────────────────
SHOPEE_SEED_CATEGORIES = int(os.getenv("SHOPEE_SEED_CATEGORIES", "8"))  # số ngành hàng duyệt/lần
SHOPEE_SEED_PAGES      = int(os.getenv("SHOPEE_SEED_PAGES", "2"))       # số trang search/ngành

# ── OCR (queue riêng, tách khỏi luồng crawl) ──────────────────
# PaddleOCR lang="vi" chỉ là model latin_dict (MẤT DẤU tiếng Việt) → mặc định
# dùng easyocr có model tiếng Việt đủ dấu. OCR_LANG hỗ trợ danh sách cho easyocr.
OCR_BACKEND     = os.getenv("OCR_BACKEND", "easyocr")     # easyocr (đủ dấu VI) | paddle
OCR_KAFKA_TOPIC = os.getenv("OCR_KAFKA_TOPIC", "lazada.ocr.jobs")
OCR_KAFKA_GROUP = os.getenv("OCR_KAFKA_GROUP", "lazada-ocr")
OCR_SEED_MAX    = int(os.getenv("OCR_SEED_MAX", "5000"))   # số post/lần seed OCR
OCR_LANG        = os.getenv("OCR_LANG", "vi,en")          # easyocr: "vi,en"; paddle: 1 lang
OCR_MIN_CONF    = float(os.getenv("OCR_MIN_CONF", "0.5"))  # ngưỡng giữ 1 dòng text
OCR_IMG_TIMEOUT = float(os.getenv("OCR_IMG_TIMEOUT", "20"))
