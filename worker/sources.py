"""Registry adapter nguồn.

Interface mỗi adapter (duck-typed):
  - open(log) / close()                     — vòng đời tài nguyên (browser…). No-op nếu không cần.
  - iter_seed_items(limit, log) -> iterable  — sinh {"external_id","url"} (có thể trùng; seeder dedup).
  - fetch_post(item, log) -> dict            — post dict theo schema store.upsert_post;
                                               ném errors.NotFound / ShellPage / Blocked.

seeder/consumer/run chọn adapter theo SOURCE_SLUG, không biết chi tiết từng nguồn.
"""


def get_adapter(slug):
    if slug == "lazada":
        from lazada import LazadaAdapter
        return LazadaAdapter()
    if slug == "shopee":
        from shopee import ShopeeAdapter
        return ShopeeAdapter()
    raise ValueError(f"Chưa có adapter cho nguồn '{slug}'")
