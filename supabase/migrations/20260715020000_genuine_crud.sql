-- CRUD CSDL Hàng thật từ UI: người dùng ĐÃ ĐĂNG NHẬP (role authenticated) được
-- thêm/sửa/xoá. anon vẫn chỉ đọc (giữ nguyên anon_read). Worker dùng service_role (bỏ RLS).

grant insert, update, delete on genuine_products to authenticated;

drop policy if exists auth_insert on genuine_products;
create policy auth_insert on genuine_products
  for insert to authenticated with check (true);

drop policy if exists auth_update on genuine_products;
create policy auth_update on genuine_products
  for update to authenticated using (true) with check (true);

drop policy if exists auth_delete on genuine_products;
create policy auth_delete on genuine_products
  for delete to authenticated using (true);
