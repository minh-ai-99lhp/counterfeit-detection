"""Khung headless-browser tái dùng (Playwright sync).

Dùng cho các nguồn client-side render / có anti-bot ký header (Shopee bây giờ,
backup Lazada sau). Ý tưởng: KHÔNG giả mạo chữ ký anti-bot — mở trang bằng browser
thật để chính SPA của sàn tự gọi API, ta chỉ *bắt response* JSON.

- Persistent context (user_data_dir) → giữ cookie + anti-bot token qua các lần
  chạy, giảm captcha; sau này nạp phiên đăng nhập cũng vào đây.
- Chặn bytes ảnh/media/font cho nhanh — URL ảnh vẫn nằm trong JSON nên không mất dữ liệu.
- Playwright sync API: mỗi thread một instance (seeder ở thread chính, consumer ở
  daemon thread — mỗi bên tự mở browser riêng).
"""
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

from config import (USER_AGENT, HEADLESS, BROWSER_PROXY, BROWSER_PROFILE_DIR,
                    NAV_TIMEOUT, BROWSER_BLOCK_MEDIA)
from errors import Blocked

# Ẩn dấu hiệu tự động hoá cơ bản (đủ cho POC).
_STEALTH = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'languages', {get: () => ['vi-VN', 'vi', 'en']});
Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
"""

_BLOCKED_HINTS = ("verify", "captcha", "/anti_", "punish")


class Browser:
    """Context manager bao 1 persistent Chromium + 1 page."""

    def __init__(self, profile_dir=None, headless=None, proxy=None,
                 block_media=None, nav_timeout=None):
        self.profile_dir = profile_dir or BROWSER_PROFILE_DIR
        self.headless = HEADLESS if headless is None else headless
        self.proxy = BROWSER_PROXY if proxy is None else proxy
        self.block_media = BROWSER_BLOCK_MEDIA if block_media is None else block_media
        self.nav_timeout = nav_timeout or NAV_TIMEOUT
        self._pw = None
        self.ctx = None
        self.page = None

    # ── vòng đời ─────────────────────────────────────────────
    def __enter__(self):
        self.start()
        return self

    def __exit__(self, *exc):
        self.close()

    def start(self):
        self._pw = sync_playwright().start()
        self.ctx = self._pw.chromium.launch_persistent_context(
            self.profile_dir,
            headless=self.headless,
            proxy={"server": self.proxy} if self.proxy else None,
            user_agent=USER_AGENT,
            locale="vi-VN",
            timezone_id="Asia/Ho_Chi_Minh",
            viewport={"width": 1366, "height": 768},
            args=["--disable-blink-features=AutomationControlled",
                  "--no-sandbox", "--disable-dev-shm-usage"],
        )
        self.ctx.set_default_navigation_timeout(self.nav_timeout)
        self.ctx.set_default_timeout(self.nav_timeout)
        self.ctx.add_init_script(_STEALTH)
        if self.block_media:
            self.ctx.route("**/*", self._maybe_block)
        self.page = self.ctx.pages[0] if self.ctx.pages else self.ctx.new_page()
        return self

    def close(self):
        try:
            if self.ctx:
                self.ctx.close()
        finally:
            if self._pw:
                self._pw.stop()
        self.ctx = self.page = self._pw = None

    def _maybe_block(self, route):
        if route.request.resource_type in ("image", "media", "font"):
            route.abort()
        else:
            route.continue_()

    # ── thao tác ─────────────────────────────────────────────
    def warm_up(self, url):
        """Mở trang chủ để JS set cookie/anti-bot token vào persistent profile."""
        try:
            self.page.goto(url, wait_until="domcontentloaded")
            self.page.wait_for_timeout(2500)
        except PWTimeout:
            pass  # warm-up hụt không chặn — capture sau sẽ tự báo Blocked nếu thật sự bị chặn

    def capture_json(self, nav_url, match, timeout=None, wait_until="domcontentloaded"):
        """Điều hướng tới nav_url, chờ response ĐẦU TIÊN khớp match(url) & 200 → trả .json().

        Timeout ⇒ ném Blocked (API không được gọi = nhiều khả năng bị anti-bot chặn).
        """
        timeout = timeout or self.nav_timeout
        try:
            with self.page.expect_response(
                    lambda r: r.status == 200 and match(r.url), timeout=timeout) as info:
                self.page.goto(nav_url, wait_until=wait_until)
            return info.value.json()
        except PWTimeout:
            raise Blocked(f"không bắt được API cho {nav_url} "
                          f"(url hiện tại: {self._safe_url()})")

    def _safe_url(self):
        try:
            return self.page.url
        except Exception:
            return "?"

    def looks_blocked(self):
        u = self._safe_url().lower()
        return any(h in u for h in _BLOCKED_HINTS)
