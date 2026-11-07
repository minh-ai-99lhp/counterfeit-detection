-- ─────────────────────────────────────────────────────────────
-- Shopee: ĐÃ KHẢO SÁT + dựng khung crawl headless-browser (worker/shopee.py),
-- nhưng TẠM GÁC. Shopee chặn truy cập tự động không session (redirect /verify,
-- API error 90309999 + response mã hoá) → cần đăng nhập/proxy mới crawl được.
-- Giữ nguồn ở 'coming_soon' (không bật Play trên UI); chỉ ghi metadata engine.
-- ─────────────────────────────────────────────────────────────
update sources
   set config = jsonb_build_object(
                  'kafka_topic',    'shopee.crawl.urls',
                  'engine',         'browser',
                  'requires_login', true,
                  'status_note',    'Khung đã dựng; chờ login/proxy để bật')
 where slug = 'shopee';

notify pgrst, 'reload schema';
