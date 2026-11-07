"""Exceptions dùng chung cho mọi nguồn (source adapter).

Consumer bắt các lỗi này để phân loại trạng thái crawl_urls/stats mà không cần
biết đang crawl nguồn nào.
"""


class NotFound(Exception):
    """Sản phẩm không tồn tại / đã gỡ (tương đương HTTP 404)."""


class ShellPage(Exception):
    """Trang trả về vỏ rỗng / template JS, không bóc được dữ liệu."""


class Blocked(Exception):
    """Bị anti-bot chặn (captcha / trang verify / rate-limit).

    Khác ShellPage ở chỗ đây là tình huống TẠM THỜI → consumer nên backoff và
    có thể thử lại sau, thay vì coi như hàng chết.
    """
