-- Dedup CSDL Hàng thật: mã xác thực (maXacThuc) của nguồn là duy nhất/sản phẩm.
-- Lưu vào genuine_products.sku → unique một phần để importer upsert idempotent.
create unique index if not exists genuine_products_sku_uidx
  on genuine_products (sku)
  where sku is not null;
