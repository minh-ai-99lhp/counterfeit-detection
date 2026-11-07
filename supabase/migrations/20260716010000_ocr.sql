-- ─────────────────────────────────────────────────────────────
-- OCR ảnh sản phẩm: bóc chữ trên ảnh chính của mỗi post.
-- Kết quả + cờ trạng thái lưu ngay trên bảng posts (POC: 1 ảnh chính/post).
-- posts đã nằm trong publication realtime (20260716000000_realtime.sql) → UI tự cập nhật.
-- ─────────────────────────────────────────────────────────────

alter table posts
  add column if not exists ocr_status text,               -- null(chưa) | queued | done | no_text | error
  add column if not exists ocr_text   text,               -- raw text nối các dòng detect được
  add column if not exists ocr_lines  jsonb,              -- [{text, conf}] từng box
  add column if not exists ocr_at      timestamptz;        -- thời điểm OCR xong

-- Seeder quét nhanh các post CHƯA OCR
create index if not exists posts_need_ocr_idx
  on posts (source_id)
  where ocr_status is null;

notify pgrst, 'reload schema';
