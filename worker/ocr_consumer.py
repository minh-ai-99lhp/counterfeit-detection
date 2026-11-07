"""OCR consumer: đọc job từ Kafka → tải ảnh → OCR → ghi posts.ocr_*.

Dừng gọn khi should_stop() bật. Kafka giữ offset → start lại consume tiếp.
"""
import json

import requests
from kafka import KafkaConsumer

import ocr_engine
import store
from config import (
    KAFKA_BOOTSTRAP, OCR_KAFKA_TOPIC, OCR_KAFKA_GROUP,
    USER_AGENT, OCR_IMG_TIMEOUT,
)


def _fetch_image(url):
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=OCR_IMG_TIMEOUT)
    r.raise_for_status()
    return r.content


def run(should_stop, log=print, drain=False):
    """drain=True: xử lý hết backlog rồi THOÁT (dùng cho supervisor 1 vòng).
    drain=False: chạy liên tục tới khi should_stop()."""
    consumer = KafkaConsumer(
        OCR_KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=OCR_KAFKA_GROUP,
        enable_auto_commit=True,
        auto_offset_reset="earliest",
        value_deserializer=lambda b: json.loads(b.decode()),
        consumer_timeout_ms=1000,
    )
    log(f"[ocr] nghe topic '{OCR_KAFKA_TOPIC}' (group={OCR_KAFKA_GROUP})")
    processed = 0
    try:
        while not should_stop():
            for msg in consumer:
                if should_stop():
                    break
                _handle(msg.value, log)
                processed += 1
            # for kết thúc = 1s không có message mới (queue cạn)
            if drain:
                break
    finally:
        consumer.close()
        log(f"[ocr] dừng. Đã OCR {processed} ảnh trong phiên này.")
    return processed


def _handle(item, log):
    post_id, url = item["post_id"], item["image_url"]
    try:
        data = _fetch_image(url)
        out = ocr_engine.ocr_image(data)          # {status, text, lines}
        store.update_post_ocr(post_id, out["status"], out["text"], out["lines"])
        store.ocr_incr(out["status"])             # done | no_text
    except Exception as e:
        store.update_post_ocr(post_id, "error", str(e)[:300], [])
        store.ocr_incr("error")
        log(f"[ocr] lỗi post {post_id}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    run(lambda: False)
