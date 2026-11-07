# paddleocr-test — spike đánh giá lại PaddleOCR cho tiếng Việt

> **Đây KHÔNG phải code production.** Thư mục thử nghiệm dùng một lần, giống `gliner2-test/`.
> Engine OCR production là **EasyOCR**, nằm ở `worker/ocr_*.py`. Không có gì ở đây được
> pipeline production import.

## Đây là gì

Ngày 2026-07-16, engine OCR được chuyển từ PaddleOCR → EasyOCR vì text tiếng Việt bị mất dấu
(`Dung luo'ng`, `Tiéng on thap`). Spike này kiểm chứng lại quyết định đó bằng **PaddleOCR bản
mới nhất (3.7.0)**, vì kết luận ban đầu chỉ dựa trên bản 2.9.1 mà project đang cài.

**Kết quả**: giữ EasyOCR. Chi tiết + số liệu ở [`paddleocr-test-report.md`](./paddleocr-test-report.md).

Tóm tắt: PaddleOCR 3.7 map `lang="vi"` sang PP-OCRv6 (không phải `latin_dict` như 2.9.1), nhưng
dict của PP-OCRv6 vẫn thiếu 44/67 ký tự tiếng Việt có dấu và chỉ có 2/90 ký tự của khối
`U+1EA0–U+1EF9` → **không thể** xuất ra chữ "mạnh". Đổi lại, detector của PaddleOCR **nhạy hơn hẳn**
EasyOCR (14/15 vs 8/15 ảnh) — gợi ý hướng lai đáng làm sau này.

## Venv nằm ngoài repo — cố ý

Khác `gliner2-test/.venv`, venv của spike này đặt ở **`/home/mega/paddle_test_venv`**:

- Nó nặng **1,3 GB** (paddlepaddle + paddleocr), mà `/mnt/d` chỉ còn ~26 GB (79% đầy).
- Đặt trên ổ Linux (`/`, còn ~924 GB) cũng nhanh hơn `/mnt/d`.
- Quan trọng: **cách ly hoàn toàn** với paddleocr 2.9.1 + easyocr đang cài cho production.
  Cài PaddleOCR 3.7 vào môi trường chung sẽ **nâng cấp đè** dependency production.

Dựng lại venv nếu cần:

```bash
python3 -m venv /home/mega/paddle_test_venv
/home/mega/paddle_test_venv/bin/pip install "paddlepaddle==3.3.1" "paddleocr==3.7.0" "psycopg[binary]"
```

Model PP-OCRv6 tự tải về `~/.paddlex/official_models/` ở lần chạy đầu (~150 MB).

## Chạy

Cần `SUPABASE_DB_URL` (script đọc ảnh + text EasyOCR từ DB để đối chiếu) và infra đang chạy.

```bash
cd /path/to/counterfeit-detection && set -a && . .env && set +a

# 15 ảnh đầu
/home/mega/paddle_test_venv/bin/python paddleocr-test/test_paddleocr.py --limit 15 --mkldnn-off

# đúng 2 ảnh gốc phát hiện lỗi mất dấu
/home/mega/paddle_test_venv/bin/python paddleocr-test/test_paddleocr.py --ids 48,60 --mkldnn-off
```

`--mkldnn-off` là **bắt buộc** trên máy này: paddlepaddle 3.3.1 bật oneDNN sẽ ném
`ConvertPirAttribute2RuntimeAttribute not support`. Lưu ý số liệu tốc độ trong report đo khi đã
tắt oneDNN nên **không phản ánh tốc độ thật** của PaddleOCR.

## Dọn

```bash
rm -rf /home/mega/paddle_test_venv ~/.paddlex   # xoá venv + model đã tải
rm -rf paddleocr-test/                          # xoá spike
```
