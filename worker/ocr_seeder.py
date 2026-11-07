"""OCR seeder: quét posts chưa OCR → đẩy job vào Kafka + đánh dấu 'queued'.

Chạy lại an toàn: post_id đã 'seen' (Redis) sẽ bị bỏ qua → chỉ thêm cái mới.
"""
import json
from kafka import KafkaProducer

import store
from config import KAFKA_BOOTSTRAP, OCR_KAFKA_TOPIC, OCR_SEED_MAX


def seed(log=print):
    rows = store.select_posts_needing_ocr(OCR_SEED_MAX)
    if not rows:
        log("[ocr-seed] không có post nào cần OCR")
        return 0

    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode(),
        linger_ms=50,
    )
    n = 0
    for post_id, image_url in rows:
        if not store.ocr_mark_seen(post_id):
            continue
        producer.send(OCR_KAFKA_TOPIC, {"post_id": post_id, "image_url": image_url})
        store.set_post_ocr_status(post_id, "queued")
        store.ocr_incr("queued")
        n += 1
    producer.flush()
    producer.close()
    log(f"[ocr-seed] đã đẩy {n} job vào topic '{OCR_KAFKA_TOPIC}'")
    return n


if __name__ == "__main__":
    seed()
