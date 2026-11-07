"""Seeder (generic): adapter.iter_seed_items → dedup (Redis) → Kafka + crawl_urls(queued).

Chạy lại nhiều lần an toàn: external_id đã 'seen' bị bỏ qua → chỉ thêm cái mới
(đúng ngữ nghĩa 'quét sản phẩm mới, skip trùng'). Không biết chi tiết nguồn nào —
mọi khác biệt (sitemap Lazada / category Shopee) nằm trong adapter.
"""
import json
from kafka import KafkaProducer

import store
from sources import get_adapter
from config import KAFKA_BOOTSTRAP, KAFKA_TOPIC, SEED_MAX_URLS, SOURCE_SLUG


def seed(log=print):
    adapter = get_adapter(SOURCE_SLUG)
    producer = KafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP,
        value_serializer=lambda v: json.dumps(v).encode(),
        linger_ms=50,
    )
    new_count = 0
    adapter.open(log)
    try:
        for item in adapter.iter_seed_items(SEED_MAX_URLS, log):
            ext = item.get("external_id")
            if not ext or not store.mark_seen(ext):
                continue  # thiếu id hoặc đã seed rồi
            producer.send(KAFKA_TOPIC, {"external_id": ext, "url": item["url"]})
            store.upsert_crawl_url(ext, item["url"], "queued")
            new_count += 1
            if new_count >= SEED_MAX_URLS:
                break
    finally:
        adapter.close()
        producer.flush()
        producer.close()

    store.touch_seeded()
    log(f"[seed] đã đẩy {new_count} URL mới vào Kafka topic '{KAFKA_TOPIC}'")
    return new_count


if __name__ == "__main__":
    seed()
