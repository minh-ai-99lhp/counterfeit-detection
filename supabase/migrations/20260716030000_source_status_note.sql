-- ─────────────────────────────────────────────────────────────
-- Ghi chú trạng thái cho các nguồn đang GÁC, để hiện trên UI (trang Tổng quan nguồn).
-- Shopee + TikTok Shop: đã khảo sát thực nghiệm 2026-07-16, cả hai chống bot mạnh
-- → không crawl được bằng cách thông thường (HTTP/headless browser không session).
-- Đường đi đúng: tích hợp qua API chính thống của sàn.
-- ─────────────────────────────────────────────────────────────

update sources
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
                  'status_note',
                  'Shopee chống bot mạnh: mọi truy cập tự động không session bị đẩy sang /verify/traffic, API v4 trả lỗi 90309999 kèm response mã hoá. Không cào được theo cách thông thường — cần tích hợp qua API chính thống (Shopee Open Platform).')
 where slug = 'shopee';

update sources
   set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
                  'status_note',
                  'TikTok Shop chống bot mạnh nhất: captcha Security Check chặn ngay ở edge, robots.txt cấm crawl. Không cào được theo cách thông thường — cần tích hợp qua API chính thống (TikTok Shop Open API / Research API).')
 where slug = 'tiktok';

notify pgrst, 'reload schema';
