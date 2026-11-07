-- POC Counterfeit — schema khởi tạo
-- Supabase = read model cho UI (Vercel). Worker ghi bằng service_role.
-- Kafka/Redis là máy móc nội bộ của worker; các bảng dưới đây là bản chiếu để UI đọc.

create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────
-- sources: danh sách nguồn crawl (hardcode, seed sẵn). UI coi như cố định.
-- ─────────────────────────────────────────────────────────────
create table if not exists sources (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  type          text not null default 'ecommerce',
  enabled       boolean not null default false,
  status_label  text not null default 'coming_soon',   -- active | coming_soon
  config        jsonb not null default '{}'::jsonb,     -- { sitemap_url, ... }
  icon          text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- crawl_control: 1 dòng / nguồn. Cầu nối Play/Stop giữa UI và worker + số liệu.
--   UI  đặt  desired_state (running/stopped)
--   worker báo worker_state + stats
-- ─────────────────────────────────────────────────────────────
create table if not exists crawl_control (
  source_id      uuid primary key references sources(id) on delete cascade,
  desired_state  text not null default 'stopped',   -- running | stopped   (UI ghi)
  worker_state   text not null default 'idle',      -- running | stopped | idle (worker ghi)
  stats          jsonb not null default '{}'::jsonb,-- seeded, queued, processing, fetched, live, dead_404, skipped_shell, saved, replaced
  last_seeded_at timestamptz,
  heartbeat_at   timestamptz,                        -- worker còn sống không
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- crawl_urls: trạng thái từng URL (bản chiếu của Redis) → Tab 1 "đang xử lý"
-- ─────────────────────────────────────────────────────────────
create table if not exists crawl_urls (
  id           bigint generated always as identity primary key,
  source_id    uuid not null references sources(id) on delete cascade,
  external_id  text not null,
  url          text not null,
  status       text not null default 'queued',  -- queued|processing|done|dead_404|skipped_shell|error
  attempts     int not null default 0,
  error        text,
  enqueued_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists idx_crawl_urls_status on crawl_urls (source_id, status, updated_at desc);

-- ─────────────────────────────────────────────────────────────
-- posts: sản phẩm crawl được → Tab 2 (phân trang) + trang detail
--   image_urls: chỉ lưu LIST URL (tải ảnh về là bước sau)
-- ─────────────────────────────────────────────────────────────
create table if not exists posts (
  id                bigint generated always as identity primary key,
  source_id         uuid not null references sources(id) on delete cascade,
  external_id       text not null,
  sku_id            text,
  url               text not null,
  title             text,
  brand_name        text,
  brand_id          text,
  price_text        text,
  price_value       numeric(14,2),
  currency          text default 'VND',
  category_path     text[],
  leaf_category_id  text,
  reg_category_id   text,
  seller_id         text,
  image_urls        text[] not null default '{}',
  primary_image_url text,
  raw               jsonb,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  crawled_at        timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists idx_posts_crawled on posts (source_id, crawled_at desc);
create index if not exists idx_posts_brand   on posts (brand_name);

-- ─────────────────────────────────────────────────────────────
-- KHUNG cho module sau (chưa dùng, tạo trước để UI có chỗ đọc)
-- ─────────────────────────────────────────────────────────────
-- Module 2: CSDL hàng thật (cũng crawl, từ official store)
create table if not exists genuine_products (
  id                bigint generated always as identity primary key,
  rights_holder     text,
  brand_name        text,
  title             text,
  sku               text,
  rrp_price         numeric(14,2),
  category_path     text[],
  image_urls        text[] not null default '{}',
  primary_image_url text,
  image_embedding   vector(512),
  is_authorized     boolean default true,
  raw               jsonb,
  created_at        timestamptz not null default now()
);

-- Module 3: AI Compare (post nghi ngờ ↔ hàng thật → điểm nghi ngờ)
create table if not exists detections (
  id            bigint generated always as identity primary key,
  post_id       bigint references posts(id) on delete cascade,
  genuine_id    bigint references genuine_products(id) on delete set null,
  score         int,                                  -- 0..100
  level         text,                                 -- low|medium|high|critical
  signals       jsonb not null default '[]'::jsonb,   -- breakdown từng tín hiệu
  reviewed      boolean default false,
  verdict       text,                                 -- confirmed|dismissed
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- RLS: anon (UI) chỉ ĐỌC; ngoại lệ cho Play/Stop được UPDATE crawl_control.
--       Worker dùng service_role (bỏ qua RLS).
-- ─────────────────────────────────────────────────────────────
alter table sources          enable row level security;
alter table crawl_control    enable row level security;
alter table crawl_urls       enable row level security;
alter table posts            enable row level security;
alter table genuine_products enable row level security;
alter table detections       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sources','crawl_control','crawl_urls','posts','genuine_products','detections']
  loop
    execute format('drop policy if exists anon_read on %I', t);
    execute format('create policy anon_read on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Play/Stop từ trình duyệt: cho phép anon cập nhật crawl_control (POC, không dữ liệu nhạy cảm)
drop policy if exists anon_control_update on crawl_control;
create policy anon_control_update on crawl_control
  for update to anon, authenticated using (true) with check (true);

-- GRANT cấp bảng (Supabase cloud tự làm; local phải grant tường minh).
-- RLS ở trên kiểm soát dòng; GRANT dưới đây mở quyền truy cập bảng cho role anon.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant update on crawl_control to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- Seed nguồn: Lazada (active) + các nguồn coming_soon
-- ─────────────────────────────────────────────────────────────
insert into sources (slug, name, type, enabled, status_label, icon, sort_order, config) values
  ('lazada',   'Lazada',      'ecommerce', true,  'active',      '🛒', 1,
     '{"sitemap_url":"https://www.lazada.vn/sitemap-products-order-last-30days-morethan0.xml","kafka_topic":"lazada.crawl.urls"}'::jsonb),
  ('shopee',   'Shopee',      'ecommerce', false, 'coming_soon', '🛍️', 2, '{}'::jsonb),
  ('tiktok',   'TikTok Shop', 'social',    false, 'coming_soon', '🎵', 3, '{}'::jsonb),
  ('facebook', 'Facebook',    'social',    false, 'coming_soon', '📘', 4, '{}'::jsonb)
on conflict (slug) do nothing;

-- tạo dòng control cho mỗi nguồn
insert into crawl_control (source_id)
select id from sources on conflict (source_id) do nothing;

-- báo PostgREST nạp lại schema cache
notify pgrst, 'reload schema';
