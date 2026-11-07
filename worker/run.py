"""Supervisor / entrypoint.

Vòng lặp giám sát:
  - poll crawl_control.desired_state (do UI đặt qua nút Play/Stop)
  - desired=running & consumer chưa chạy  → bật consumer; chỉ seed thêm khi hàng đợi rỗng
  - desired=stopped & consumer đang chạy  → dừng consumer gọn
  - luôn báo worker_state + stats + heartbeat lên Supabase để UI hiện tiến độ

Chạy:  python run.py       (giữ tiến trình này sống ở máy local)
"""
import threading
import time

import store
import seeder
import consumer
from config import CONTROL_POLL


class Worker:
    def __init__(self):
        self._stop = threading.Event()
        self._thread = None

    def running(self):
        return self._thread is not None and self._thread.is_alive()

    def start(self, log):
        self._stop.clear()
        # Chỉ seed khi hàng đợi RỖNG — tránh mỗi lần Play lại nạp thêm SEED_MAX_URLS
        # (trước đây Play nào cũng seed → 'Đã seed' tăng 2000/lần dù chưa xử lý xong).
        backlog = store.count_queued()
        if backlog > 0:
            log(f"[supervisor] Play → còn {backlog} URL trong hàng đợi, chạy tiếp (KHÔNG seed thêm)")
        else:
            log("[supervisor] Play → hàng đợi rỗng, seed URL mới + bật consumer")
            try:
                seeder.seed(log)
            except Exception as e:
                log(f"[supervisor] seed lỗi (vẫn chạy consumer với backlog cũ): {e}")
        self._thread = threading.Thread(
            target=consumer.run, args=(self._stop.is_set, log), daemon=True)
        self._thread.start()

    def stop(self, log):
        log("[supervisor] Stop → dừng consumer")
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=15)


def main():
    log = lambda m: print(time.strftime("%H:%M:%S"), m, flush=True)
    w = Worker()
    log(f"[supervisor] khởi động. Poll crawl_control mỗi {CONTROL_POLL}s. Ctrl-C để thoát.")
    store.report_control("idle")
    try:
        while True:
            desired = store.get_desired_state()
            if desired == "running" and not w.running():
                w.start(log)
            elif desired == "stopped" and w.running():
                w.stop(log)
            store.report_control("running" if w.running() else "idle")
            time.sleep(CONTROL_POLL)
    except KeyboardInterrupt:
        log("[supervisor] thoát, dừng consumer...")
        w.stop(log)
        store.report_control("idle")


if __name__ == "__main__":
    main()
