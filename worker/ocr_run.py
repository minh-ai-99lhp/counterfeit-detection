"""Supervisor OCR (độc lập với worker crawl).

Vòng lặp: seed (post mới cần OCR) → consume tới khi cạn → nghỉ → lặp.
Chạy:  python ocr_run.py     (Ctrl-C dừng gọn)

Khác với crawl worker: OCR chạy tự động, KHÔNG cần nút Play/Stop trên UI.
Cờ ocr_status trên từng post là tín hiệu tiến độ (UI đọc realtime).
"""
import threading
import time

import ocr_seeder
import ocr_consumer
import store

IDLE_SLEEP = 10.0   # giây nghỉ giữa 2 vòng khi hết việc


def main():
    log = lambda m: print(time.strftime("%H:%M:%S"), m, flush=True)
    stop = threading.Event()
    log("[ocr-sup] khởi động. Ctrl-C để thoát.")
    try:
        while True:
            try:
                n = ocr_seeder.seed(log)
            except Exception as e:
                n = 0
                log(f"[ocr-sup] seed lỗi: {e}")
            # consume tới khi cạn backlog rồi thoát (drain=True)
            drained = ocr_consumer.run(lambda: stop.is_set(), log, drain=True)
            snap = store.ocr_stats_snapshot()
            log(f"[ocr-sup] vòng xong: seed={n} ocr={drained} stats={snap}")
            if n == 0 and drained == 0:
                time.sleep(IDLE_SLEEP)
    except KeyboardInterrupt:
        stop.set()
        log("[ocr-sup] thoát.")


if __name__ == "__main__":
    main()
