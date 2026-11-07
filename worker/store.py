"""Lớp lưu trữ: Redis (kiểm soát/dedup/counter) + Supabase Postgres (read model)."""
import json
import redis
import psycopg
from psycopg.types.json import Jsonb

from config import REDIS_URL, SUPABASE_DB_URL, SOURCE_SLUG

# ── Redis keys ────────────────────────────────────────────────
def _k(*parts):
    return ":".join(["crawl", SOURCE_SLUG, *parts])

K_SEEN       = _k("seen")        # SET external_id đã từng thấy (dedup)
K_PROCESSING = _k("processing")  # SET external_id đang xử lý (in-flight)

# Không giữ counter tích lũy ở Redis nữa: mọi số hiển thị dẫn xuất từ crawl_urls
# (xem stats_snapshot) để chỉ có MỘT nguồn sự thật.

r = redis.from_url(REDIS_URL, decode_responses=True)


def mark_seen(external_id) -> bool:
    """True nếu là URL MỚI (chưa từng seed)."""
    return r.sadd(K_SEEN, external_id) == 1


def start_processing(external_id):
    r.sadd(K_PROCESSING, external_id)


def end_processing(external_id):
    r.srem(K_PROCESSING, external_id)


def stats_snapshot() -> dict:
    """Số liệu THẬT, dẫn xuất từ crawl_urls + posts (nguồn sự thật), KHÔNG dùng
    counter Redis tích lũy (counter chỉ incr, không decr → phóng đại 'queued').

    - seeded  = tổng URL đã seed (mọi trạng thái)
    - queued  = còn CHỜ thật sự (status='queued')
    - fetched = đã chạm tới (done + 404 + shell + error)
    - processing lấy từ Redis set (in-flight thực), chính xác hơn cột DB nếu worker chết giữa chừng.
    """
    with db().cursor() as cur:
        cur.execute("select status, count(*) from crawl_urls where source_id=%s group by status",
                    (source_id(),))
        by = {row[0]: row[1] for row in cur.fetchall()}
        cur.execute("select count(*) from posts where source_id=%s", (source_id(),))
        posts_n = cur.fetchone()[0]
    done, dead_404 = by.get("done", 0), by.get("dead_404", 0)
    skipped_shell, error = by.get("skipped_shell", 0), by.get("error", 0)
    return {
        "seeded": sum(by.values()),
        "queued": by.get("queued", 0),
        "processing": r.scard(K_PROCESSING),
        "fetched": done + dead_404 + skipped_shell + error,
        "live": posts_n,
        "saved": posts_n,
        "replaced": 0,
        "dead_404": dead_404,
        "skipped_shell": skipped_shell,
        "error": error,
    }


# Trạng thái coi như đã xử lý xong hẳn. 'error' KHÔNG nằm đây: lỗi thường do
# blocked/mạng (tạm thời) → để Kafka giao lại thì retry.
_TERMINAL = ("done", "dead_404", "skipped_shell")


def is_terminal(external_id) -> bool:
    """URL này crawl xong rồi? Dùng để bỏ qua message Kafka giao lại (replay)."""
    with db().cursor() as cur:
        cur.execute("select status from crawl_urls where source_id=%s and external_id=%s",
                    (source_id(), external_id))
        row = cur.fetchone()
        return row is not None and row[0] in _TERMINAL


def count_queued() -> int:
    """Số URL còn CHỜ trong hàng đợi (dùng để quyết định có seed thêm khi Play không)."""
    with db().cursor() as cur:
        cur.execute("select count(*) from crawl_urls where source_id=%s and status='queued'",
                    (source_id(),))
        return cur.fetchone()[0]


# ── Supabase Postgres (service-role qua session pooler) ───────
_conn = None
def db():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(SUPABASE_DB_URL, autocommit=True, connect_timeout=30)
    return _conn


_source_id_cache = None
def source_id() -> str:
    global _source_id_cache
    if _source_id_cache is None:
        with db().cursor() as cur:
            cur.execute("select id from sources where slug=%s", (SOURCE_SLUG,))
            _source_id_cache = str(cur.fetchone()[0])
    return _source_id_cache


def upsert_crawl_url(external_id, url, status, attempts=0, error=None):
    with db().cursor() as cur:
        cur.execute("""
            insert into crawl_urls (source_id, external_id, url, status, attempts, error)
            values (%s,%s,%s,%s,%s,%s)
            on conflict (source_id, external_id) do update
              set status=excluded.status, attempts=excluded.attempts,
                  error=excluded.error, updated_at=now()
        """, (source_id(), external_id, url, status, attempts, error))


def upsert_post(p: dict) -> str:
    """Trả 'saved' (mới) hoặc 'replaced' (đã có, cập nhật)."""
    with db().cursor() as cur:
        cur.execute("select 1 from posts where source_id=%s and external_id=%s",
                    (source_id(), p["external_id"]))
        existed = cur.fetchone() is not None
        cur.execute("""
            insert into posts (source_id, external_id, sku_id, url, title, brand_name,
                brand_id, price_text, price_value, currency, category_path,
                leaf_category_id, reg_category_id, seller_id, image_urls,
                primary_image_url, raw, last_seen_at, crawled_at)
            values (%(sid)s,%(external_id)s,%(sku_id)s,%(url)s,%(title)s,%(brand_name)s,
                %(brand_id)s,%(price_text)s,%(price_value)s,%(currency)s,%(category_path)s,
                %(leaf_category_id)s,%(reg_category_id)s,%(seller_id)s,%(image_urls)s,
                %(primary_image_url)s,%(raw)s, now(), now())
            on conflict (source_id, external_id) do update set
                sku_id=excluded.sku_id, url=excluded.url, title=excluded.title,
                brand_name=excluded.brand_name, brand_id=excluded.brand_id,
                price_text=excluded.price_text, price_value=excluded.price_value,
                category_path=excluded.category_path, leaf_category_id=excluded.leaf_category_id,
                reg_category_id=excluded.reg_category_id, seller_id=excluded.seller_id,
                image_urls=excluded.image_urls, primary_image_url=excluded.primary_image_url,
                raw=excluded.raw, last_seen_at=now(), crawled_at=now()
        """, {"sid": source_id(), **{**p, "raw": Jsonb(p.get("raw"))}})
    return "replaced" if existed else "saved"


def get_desired_state() -> str:
    with db().cursor() as cur:
        cur.execute("select desired_state from crawl_control where source_id=%s", (source_id(),))
        row = cur.fetchone()
        return row[0] if row else "stopped"


def report_control(worker_state: str):
    """Đẩy worker_state + stats snapshot + heartbeat lên crawl_control."""
    with db().cursor() as cur:
        cur.execute("""
            update crawl_control
               set worker_state=%s, stats=%s, heartbeat_at=now(), updated_at=now()
             where source_id=%s
        """, (worker_state, Jsonb(stats_snapshot()), source_id()))


def touch_seeded():
    with db().cursor() as cur:
        cur.execute("update crawl_control set last_seeded_at=now() where source_id=%s",
                    (source_id(),))


# ── OCR: queue riêng (Redis dedup/stats + posts.ocr_*) ────────
K_OCR_SEEN  = _k("ocr", "seen")
K_OCR_STATS = _k("ocr", "stats")
OCR_STAT_FIELDS = ["queued", "done", "no_text", "error"]


def ocr_mark_seen(post_id) -> bool:
    """True nếu post_id CHƯA từng đưa vào queue OCR."""
    return r.sadd(K_OCR_SEEN, str(post_id)) == 1


def ocr_incr(field, n=1):
    r.hincrby(K_OCR_STATS, field, n)


def ocr_stats_snapshot() -> dict:
    raw = r.hgetall(K_OCR_STATS)
    return {f: int(raw.get(f, 0)) for f in OCR_STAT_FIELDS}


def select_posts_needing_ocr(limit):
    """Các post có ảnh chính nhưng chưa OCR (ocr_status is null)."""
    with db().cursor() as cur:
        cur.execute("""
            select id, primary_image_url from posts
             where source_id=%s and ocr_status is null
               and primary_image_url is not null and primary_image_url <> ''
             limit %s
        """, (source_id(), limit))
        return cur.fetchall()


def set_post_ocr_status(post_id, status):
    with db().cursor() as cur:
        cur.execute("update posts set ocr_status=%s where id=%s", (status, post_id))


def update_post_ocr(post_id, status, text, lines):
    with db().cursor() as cur:
        cur.execute("""
            update posts set ocr_status=%s, ocr_text=%s, ocr_lines=%s, ocr_at=now()
             where id=%s
        """, (status, text, Jsonb(lines), post_id))
