-- ─────────────────────────────────────────────────────────────
-- Bật Supabase Realtime cho các bảng UI cần theo dõi trực tiếp.
-- Publication `supabase_realtime` mặc định RỖNG trên bản local →
-- phải thêm bảng tường minh, nếu không client không nhận được event.
-- REPLICA IDENTITY FULL để payload UPDATE/DELETE mang đủ cột
-- (cần cho việc lọc theo source_id ở phía client).
-- ─────────────────────────────────────────────────────────────

alter table crawl_control replica identity full;
alter table crawl_urls    replica identity full;
alter table posts         replica identity full;

alter publication supabase_realtime add table crawl_control;
alter publication supabase_realtime add table crawl_urls;
alter publication supabase_realtime add table posts;
