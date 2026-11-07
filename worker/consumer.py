"""Consumer (generic): Kafka → adapter.fetch_post → upsert posts + cập nhật trạng thái.

Dừng gọn khi cờ stop bật (supervisor điều khiển theo crawl_control.desired_state).
Kafka giữ offset → start lại consume tiếp, không crawl lại cái đã xong.
Adapter lo chi tiết từng nguồn; consumer chỉ phân loại theo errors dùng chung.
"""
import json
import time
from kafka import KafkaConsumer

import store
import errors
from sources import get_adapter
from config import (KAFKA_BOOTSTRAP, KAFKA_TOPIC, KAFKA_GROUP, FETCH_DELAY, SOURCE_SLUG)

_BLOCKED_BACKOFF = 30.0   # giây nghỉ khi bị anti-bot chặn (tránh dập liên tục)


def run(should_stop, log=print):
    """should_stop: callable trả True khi cần dừng."""
    adapter = get_adapter(SOURCE_SLUG)
    adapter.open(log)
    consumer = KafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=KAFKA_GROUP,
        enable_auto_commit=True,
        auto_offset_reset="earliest",
        value_deserializer=lambda b: json.loads(b.decode()),
        consumer_timeout_ms=1000,   # nhả vòng lặp mỗi giây để kiểm tra stop
    )
    log(f"[consume] nghe topic '{KAFKA_TOPIC}' (group={KAFKA_GROUP})")
    processed = skipped = 0
    try:
        while not should_stop():
            for msg in consumer:
                if should_stop():
                    break
                if _handle(adapter, msg.value, log):
                    processed += 1
                    time.sleep(FETCH_DELAY)   # chỉ điều tiết khi có fetch THẬT
                else:
                    skipped += 1              # replay: không chạm mạng → không nghỉ
            # hết batch (consumer_timeout) → quay lại kiểm tra stop
    finally:
        consumer.close()
        adapter.close()
        log(f"[consume] dừng. Đã xử lý {processed} URL, bỏ qua {skipped} URL đã xong "
            f"(Kafka giao lại) trong phiên này.")
    return processed


def _handle(adapter, item, log):
    """True nếu có fetch thật; False nếu bỏ qua (đã crawl xong từ trước)."""
    ext, url = item["external_id"], item["url"]
    if store.is_terminal(ext):
        return False
    store.start_processing(ext)
    store.upsert_crawl_url(ext, url, "processing")
    try:
        post = adapter.fetch_post(item, log)
        store.upsert_post(post)
        store.upsert_crawl_url(ext, url, "done")
    except errors.NotFound:
        store.upsert_crawl_url(ext, url, "dead_404")
    except errors.ShellPage as e:
        store.upsert_crawl_url(ext, url, "skipped_shell", error=str(e))
    except errors.Blocked as e:
        store.upsert_crawl_url(ext, url, "error", error=f"blocked: {str(e)[:200]}")
        log(f"[consume] blocked {ext}: {e} → nghỉ {_BLOCKED_BACKOFF}s")
        time.sleep(_BLOCKED_BACKOFF)
    except Exception as e:
        store.upsert_crawl_url(ext, url, "error", error=str(e)[:300])
        log(f"[consume] lỗi {ext}: {type(e).__name__}: {e}")
    finally:
        store.end_processing(ext)
    return True
