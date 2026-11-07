"""Engine OCR — bọc PaddleOCR (mặc định) với fallback EasyOCR.

Trả về text thô của 1 ảnh. Bước *detect* của OCR chính là cổng "có text hay
không": 0 box → status='no_text' (KHÔNG cần model phân loại riêng).

Dùng:
    python ocr_engine.py <đường-dẫn-ảnh | url>
"""
import io

import numpy as np
from PIL import Image

from config import OCR_BACKEND, OCR_LANG, OCR_MIN_CONF

_engine = None


def _load():
    """Lazy-init 1 engine dùng lại cho mọi ảnh (nạp model chỉ 1 lần)."""
    global _engine
    if _engine is not None:
        return _engine
    if OCR_BACKEND == "easyocr":
        import easyocr
        # EasyOCR có model tiếng Việt thật (đủ dấu tổ hợp) — khác PaddleOCR
        # lang="vi" vốn chỉ là model latin_dict, mất dấu. OCR_LANG chấp nhận
        # danh sách "vi,en" (bao bì lẫn tiếng Anh: PANASONIC, MODEL, mAh…).
        langs = [x.strip() for x in OCR_LANG.split(",") if x.strip()]
        _engine = ("easyocr", easyocr.Reader(langs, gpu=False))
    else:
        from paddleocr import PaddleOCR
        # paddle chỉ nhận 1 lang → lấy phần tử đầu nếu OCR_LANG là danh sách.
        lang = OCR_LANG.split(",")[0].strip()
        _engine = ("paddle", PaddleOCR(use_angle_cls=True, lang=lang, show_log=False))
    return _engine


def _to_ndarray(img_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    return np.array(img)


def _run_paddle(engine, arr):
    """Chuẩn hoá kết quả PaddleOCR (chịu được API 2.x và 3.x)."""
    lines = []
    # API cổ điển 2.x: ocr(arr, cls=True) -> [[ [box,(text,conf)], ... ]]
    if hasattr(engine, "ocr"):
        try:
            res = engine.ocr(arr, cls=True)
        except TypeError:
            res = engine.ocr(arr)
        page = (res or [None])[0] or []
        for item in page:
            try:
                text, conf = item[1][0], float(item[1][1])
            except (IndexError, TypeError):
                continue
            lines.append((text, conf))
        return lines
    # API 3.x: predict(arr) -> [{'rec_texts':[...], 'rec_scores':[...]}]
    res = engine.predict(arr)
    for page in res or []:
        texts = page.get("rec_texts", [])
        scores = page.get("rec_scores", [1.0] * len(texts))
        for t, s in zip(texts, scores):
            lines.append((t, float(s)))
    return lines


def _run_easyocr(reader, arr):
    out = reader.readtext(arr)  # [(box, text, conf), ...]
    return [(t, float(c)) for _, t, c in out]


def ocr_image(img_bytes: bytes) -> dict:
    """Trả {status, text, lines}. status ∈ done | no_text."""
    kind, engine = _load()
    arr = _to_ndarray(img_bytes)
    raw = _run_paddle(engine, arr) if kind == "paddle" else _run_easyocr(engine, arr)
    lines = [{"text": t, "conf": round(c, 3)} for t, c in raw if t and c >= OCR_MIN_CONF]
    if not lines:
        return {"status": "no_text", "text": "", "lines": []}
    text = "\n".join(l["text"] for l in lines)
    return {"status": "done", "text": text, "lines": lines}


if __name__ == "__main__":
    import sys
    import requests
    from config import USER_AGENT, OCR_IMG_TIMEOUT

    src = sys.argv[1]
    if src.startswith("http"):
        data = requests.get(src, headers={"User-Agent": USER_AGENT}, timeout=OCR_IMG_TIMEOUT).content
    else:
        with open(src, "rb") as f:
            data = f.read()
    print(f"[ocr_engine] backend={OCR_BACKEND} lang={OCR_LANG}")
    out = ocr_image(data)
    print(f"status={out['status']}  ({len(out['lines'])} dòng)")
    print("─" * 40)
    print(out["text"])
