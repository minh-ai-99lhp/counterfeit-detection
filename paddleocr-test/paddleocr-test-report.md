# Báo cáo kiểm chứng lại PaddleOCR cho tiếng Việt

**Ngày**: 2026-07-16 · **Script**: `paddleocr-test/test_paddleocr.py` · **Trạng thái**: chỉ test, KHÔNG đụng production

## Mục đích

Kiểm tra lại kết luận trước đó ("PaddleOCR không làm được tiếng Việt") bằng **bản PaddleOCR mới nhất**, vì kết luận cũ chỉ dựa trên bản 2.9.1 mà project đang cài.

## Môi trường test

| Hạng mục | Giá trị |
|---|---|
| PaddleOCR | **3.7.0** (mới nhất; production đang dùng 2.9.1) |
| paddlepaddle | **3.3.1** |
| Detection model | **PP-OCRv6_medium_det** |
| Recognition model | **PP-OCRv6_medium_rec** (74 MB, dict 18.708 ký tự) |
| Thiết bị | **CPU** (`device="cpu"`, `enable_mkldnn=False`) |
| Cài ở | venv riêng `/home/mega/paddle_test_venv` — **không** đụng dependency production |
| Dữ liệu | Chính bộ ảnh production: `posts.primary_image_url` (ảnh chính sản phẩm Lazada, JPG từ CDN) |
| Đối chiếu | `posts.ocr_text` do EasyOCR 1.7.2 (`vi,en`) sinh ra |

**Model dùng có hỗ trợ tiếng Việt không?** `lang="vi"` trong 3.7.0 **không** còn map vào `latin_dict` như 2.9.1 — nó resolve sang PP-OCRv6, model hợp nhất đa ngữ. Đây là model đúng để test, không phải model English-only.

## Kết quả

### Trên 15 ảnh đầu

| | PaddleOCR 3.7 | EasyOCR 1.7.2 |
|---|---|---|
| Ảnh đọc ra chữ | **14 / 15** ✅ | 8 / 15 |
| Tốc độ TB | 16,3 s/ảnh | ~15 s/ảnh |
| Tỉ lệ ký tự có dấu | 0,114 | 0,089 |

Nhìn bảng này PaddleOCR có vẻ **thắng**. Nhưng chỉ số "tỉ lệ ký tự có dấu" là **thước đo sai** — nó đếm dấu chứ không kiểm dấu *đúng*. Phải đọc text thật.

### Text thật — 2 ảnh gốc user báo lỗi

**Post 60**

| PaddleOCR 3.7 (PP-OCRv6) | EasyOCR |
|---|---|
| `Gió mnh` | `Gió mạnh` ✅ |
| `Tc đ cao` | `Tốc độ cao` ✅ |
| `Ting ôn thp` | `Tiếng ồn thấp` ✅ |
| `Hiu ng hút bi tt` | `Hiệu ứng hút bụi tốt` ✅ |

**Post 48**

| PaddleOCR 3.7 | EasyOCR |
|---|---|
| `Dung lưng` | `Dung lượng` ✅ |
| `Đin áp` | `Điện áp` ✅ |
| `Kích thuưc` | `Kích thước` ✅ |
| `Xut xú` | `Xuất xứ` ✅ |
| `Nht bn` | `Nhật bản` ✅ |
| `SX bi` | `SX bởi` ✅ |

PP-OCRv6 **nuốt hẳn ký tự** thiếu dấu (`mạnh`→`mnh`). Đây còn **tệ hơn** 2.9.1 — bản cũ ít ra còn thay thế (`luo'ng`), bản mới xoá luôn.

## Nguyên nhân — đã xác định chính xác, không suy đoán

Không phải cấu hình, không phải version, không phải preprocessing. **Là bản thân dict của model.**

Kiểm trực tiếp `character_dict` trong `inference.yml` của PP-OCRv6_medium_rec:

```
dict: 18.708 ký tự
ký tự tiếng Việt có dấu:  23/67   (thiếu 44)
khối U+1EA0–U+1EF9:        2/90   ← khối RIÊNG của tiếng Việt
dấu tổ hợp (U+0300–U+036F): KHÔNG CÓ
```

- **CÓ**: `à á â ã è é ê ì í ò ó ô õ ù ú ý ă đ ĩ ũ ơ ư ồ` — đúng những ký tự **dùng chung với tiếng Pháp/Bồ/Tây Ban Nha**.
- **THIẾU**: `ạ ả ấ ầ ẩ ẫ ậ ắ ằ ẳ ẵ ặ ẹ ẻ ẽ ế ề ể ễ ệ ỉ ị ọ ỏ ố ổ ỗ ộ ớ ờ ở ỡ ợ ụ ủ ứ ừ ử ữ ự ỳ ỵ ỷ ỹ`

Không có dấu tổ hợp ⇒ model **không thể ghép NFD** (`a` + U+0323) để bù. Nghĩa là model **về mặt vật lý không có đầu ra** cho chữ "mạnh". Đây là giới hạn cứng, không tham số nào chỉnh được.

So sánh cùng phép đo với 2.9.1: `latin_dict.txt` có **17/67**. Vậy PP-OCRv6 có khá hơn (23/67) nhưng **vẫn không đủ để viết tiếng Việt**.

## Đính chính kết luận trước của tôi

| Điều tôi đã nói | Thực tế |
|---|---|
| "`vi` map vào `latin_dict`" | Đúng với **2.9.1**, **sai** với 3.7 (map vào PP-OCRv6, dict 18.708 ký tự) |
| "PaddleOCR không làm được tiếng Việt" | **Vẫn đúng** — nhưng lý do chuẩn là *dict thiếu khối U+1EA0–U+1EF9*, không phải "vì nó là model latin" |
| "detector paddle nhạy hơn easyocr" | **Đúng, và mạnh hơn tôi tưởng**: 14/15 vs 8/15 |

## Phát hiện thêm: PaddleOCR **thắng rõ ở khâu detection**

Đây là điều đáng giá nhất của bài test. Trên post 48, PaddleOCR bắt được 25 dòng gồm `Lithium`, `Industrial`, `01-2027`, `34.5x17mm` — EasyOCR **bỏ sót** hết. Post 60, PaddleOCR gom `Hiệu ứng hút bụi tốt` thành 1 dòng đúng thứ tự, EasyOCR tách rời `Hiệu` / `hút bụi tốt` / `ứng` sai thứ tự.

Nói cách khác, hai thư viện thua/thắng ở **hai khâu khác nhau**:

| Khâu | Thắng |
|---|---|
| Detection (tìm & cắt vùng chữ) | **PaddleOCR** (14/15 vs 8/15, layout tốt hơn) |
| Recognition (đọc chữ tiếng Việt) | **EasyOCR** (dấu đúng; Paddle bất khả thi) |

## Kết luận

**Có nên chuyển lại PaddleOCR không? → KHÔNG**, nếu chuyển nguyên khối. Với dự án đối chiếu hàng thật, text mất dấu (`Gió mnh`, `Nht bn`) gần như vô dụng cho so khớp — mà đó lại đúng là khâu PaddleOCR không thể làm.

**Giữ EasyOCR làm recognizer.** Quyết định đổi engine trước đó là đúng, dù lý do tôi đưa ra lúc đầu chưa chuẩn về mặt kỹ thuật.

**Nhưng nên cân nhắc hướng lai (hybrid)** — đây là kết quả có giá trị nhất từ bài test này, giải quyết luôn vấn đề 22 ảnh `no_text`:

```
PP-OCRv6_medium_det  (detect + crop — recall cao)
        ↓ crop
EasyOCR recognizer   (đọc tiếng Việt có dấu)
```

Nếu muốn chất lượng tiếng Việt cao nhất, recognizer nên là **VietOCR** (transformer chuyên tiếng Việt) thay cho EasyOCR.

**Nếu vẫn muốn dùng PaddleOCR** thì bắt buộc phải **fine-tune lại rec model với dict tiếng Việt đầy đủ** (thêm 44 ký tự thiếu + dữ liệu train) — chi phí lớn, không đáng cho giai đoạn demo.

## Ghi chú kỹ thuật

- `paddlepaddle 3.3.1` + oneDNN ném `ConvertPirAttribute2RuntimeAttribute not support` trên CPU này ⇒ phải `enable_mkldnn=False`. Tốc độ ~16 s/ảnh **đã bị ảnh hưởng bởi việc tắt oneDNN**, nên con số này *không* phản ánh tốc độ tối đa của PaddleOCR — không nên dùng để kết luận về hiệu năng.
- Số ảnh: bảng 15-ảnh so PaddleOCR (đo hôm nay) với EasyOCR (đã lưu trong DB) trên **cùng post id** ⇒ so 1-1 hợp lệ.

## Cách chạy lại

```bash
cd /path/to/counterfeit-detection && set -a && . .env && set +a
/home/mega/paddle_test_venv/bin/python paddleocr-test/test_paddleocr.py --limit 15 --mkldnn-off
/home/mega/paddle_test_venv/bin/python paddleocr-test/test_paddleocr.py --ids 48,60 --mkldnn-off
```
