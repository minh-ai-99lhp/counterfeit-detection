"""Bài test ĐỘC LẬP: đánh giá lại PaddleOCR (bản mới) trên đúng bộ ảnh mà
EasyOCR (engine production hiện tại) đã xử lý.

KHÔNG đụng code production. KHÔNG thay engine. Chỉ đọc DB + chạy PaddleOCR
trong venv riêng rồi in báo cáo so sánh.

Chạy:
    /home/mega/paddle_test_venv/bin/python paddleocr-test/test_paddleocr.py [--limit N]

Yêu cầu: env SUPABASE_DB_URL (lấy từ .env của project).
"""
import argparse
import io
import json
import os
import time

import numpy as np
import psycopg
import requests
from PIL import Image

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
IMG_TIMEOUT = 20


def fetch_dataset(db_url, limit, ids=None):
    """Lấy đúng bộ ảnh production: post đã có ảnh chính + text EasyOCR để đối chiếu."""
    with psycopg.connect(db_url) as c:
        if ids:
            return c.execute(
                """select id, primary_image_url, ocr_status, coalesce(ocr_text,'')
                     from posts where id = any(%s) order by id""",
                (ids,),
            ).fetchall()
        return c.execute(
            """select id, primary_image_url, ocr_status, coalesce(ocr_text,'')
                 from posts
                where primary_image_url is not null
                order by id
                limit %s""",
            (limit,),
        ).fetchall()


def load_image(url):
    d = requests.get(url, headers={"User-Agent": UA}, timeout=IMG_TIMEOUT).content
    return np.array(Image.open(io.BytesIO(d)).convert("RGB"))


def run_paddle(engine, arr):
    """Chuẩn hoá output PaddleOCR 3.x -> [(text, conf)]."""
    res = engine.predict(arr)
    out = []
    for page in res or []:
        texts = page.get("rec_texts", [])
        scores = page.get("rec_scores", [1.0] * len(texts))
        out += [(t, float(s)) for t, s in zip(texts, scores)]
    return out


# Ký tự tiếng Việt có dấu tổ hợp — thước đo khách quan: model có xuất được không.
VN_CHARS = set("ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ"
               "ĂÂĐÊÔƠƯÀÁẢÃẠẰẮẲẴẶẦẤẨẪẬÈÉẺẼẸỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌỒỐỔỖỘỜỚỞỠỢÙÚỦŨỤỪỨỬỮỰỲÝỶỸỴ")


def vn_ratio(text):
    """Tỉ lệ ký tự có dấu / tổng chữ cái — 0 nghĩa là mất dấu hoàn toàn."""
    letters = [ch for ch in text if ch.isalpha()]
    if not letters:
        return 0.0
    return sum(1 for ch in letters if ch in VN_CHARS) / len(letters)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=15)
    ap.add_argument("--lang", default="vi")
    ap.add_argument("--out", default=None, help="ghi JSON kết quả thô")
    ap.add_argument("--mkldnn-off", action="store_true", help="tắt oneDNN nếu paddle lỗi")
    ap.add_argument("--ids", default=None, help="chỉ chạy các post id này, vd: 48,60")
    args = ap.parse_args()

    db_url = os.environ["SUPABASE_DB_URL"]

    import paddleocr
    from paddleocr import PaddleOCR

    print(f"paddleocr version : {paddleocr.__version__}")

    # Ghi rõ model đang dùng (yêu cầu #5) — hỏi thẳng bộ resolver của thư viện.
    try:
        from paddleocr._pipelines.ocr import PaddleOCR as _P
        det_name, rec_name = _P._get_ocr_model_names(args.lang, None)
        print(f"lang='{args.lang}' -> det={det_name}  rec={rec_name}")
    except Exception as e:
        print(f"(không introspect được tên model: {e})")

    t0 = time.time()
    # enable_mkldnn=False: paddlepaddle 3.3.1 trên CPU này ném
    # "ConvertPirAttribute2RuntimeAttribute not support" khi bật oneDNN.
    engine = PaddleOCR(
        lang=args.lang,
        use_textline_orientation=True,
        device="cpu",
        enable_mkldnn=not args.mkldnn_off,
    )
    print(f"device            : cpu")
    print(f"model load        : {time.time()-t0:.1f}s")

    ids = [int(x) for x in args.ids.split(",")] if args.ids else None
    rows = fetch_dataset(db_url, args.limit, ids)
    print(f"dataset           : {len(rows)} ảnh (cùng bộ EasyOCR đã chạy)\n")

    results = []
    for pid, url, easy_status, easy_text in rows:
        try:
            arr = load_image(url)
        except Exception as e:
            print(f"[post {pid}] tải ảnh lỗi: {e}")
            continue

        t = time.time()
        try:
            lines = run_paddle(engine, arr)
        except Exception as e:
            print(f"[post {pid}] paddle lỗi: {e}")
            continue
        dt = time.time() - t

        text = "\n".join(x[0] for x in lines)
        conf = sum(x[1] for x in lines) / len(lines) if lines else 0.0
        results.append({
            "post_id": pid,
            "paddle_text": text,
            "paddle_lines": len(lines),
            "paddle_conf": round(conf, 3),
            "paddle_sec": round(dt, 2),
            "paddle_vn_ratio": round(vn_ratio(text), 3),
            "easy_status": easy_status,
            "easy_text": easy_text,
            "easy_vn_ratio": round(vn_ratio(easy_text), 3),
        })
        print(f"[post {pid}] paddle: {len(lines):3d} dòng  conf={conf:.2f}  "
              f"{dt:5.2f}s  vn={vn_ratio(text):.2f}   | easy: {easy_status} "
              f"vn={vn_ratio(easy_text):.2f}")

    if not results:
        print("Không có kết quả.")
        return

    n = len(results)
    p_time = sum(r["paddle_sec"] for r in results) / n
    p_found = sum(1 for r in results if r["paddle_lines"] > 0)
    e_found = sum(1 for r in results if r["easy_status"] == "done")
    p_vn = sum(r["paddle_vn_ratio"] for r in results) / n
    e_vn = sum(r["easy_vn_ratio"] for r in results) / n

    print("\n" + "=" * 60)
    print(f"{'':22} {'PaddleOCR':>12} {'EasyOCR':>12}")
    print(f"{'ảnh đọc ra chữ':22} {p_found:>12} {e_found:>12}  / {n}")
    print(f"{'tốc độ TB (s/ảnh)':22} {p_time:>12.2f} {'~15 (đo trước)':>12}")
    print(f"{'tỉ lệ ký tự có dấu':22} {p_vn:>12.3f} {e_vn:>12.3f}")
    print("=" * 60)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\nJSON thô -> {args.out}")


if __name__ == "__main__":
    main()
