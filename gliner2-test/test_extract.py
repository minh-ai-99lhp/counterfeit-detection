"""
Test GLiNER2 để trích xuất {category} {brand} {family} {variant}
từ tiêu đề / mô tả sản phẩm (dùng cho POC phát hiện hàng giả).

Chạy:
    ./.venv/bin/python test_extract.py
"""

from gliner2 import GLiNER2

# base = nhẹ (205M), large = chính xác hơn (340M)
MODEL = "fastino/gliner2-base-v1"

# Ánh xạ nhãn mô tả (dài, rõ nghĩa) -> khóa ngắn bạn muốn
LABEL_MAP = {
    "type of product (wine, shampoo, detergent, milk...)": "category",
    "commercial brand name": "brand",
    "product line or series name": "family",
    "package specification such as volume, weight or size": "variant",
}
LABELS = list(LABEL_MAP.keys())

SAMPLES = [
    "Sữa tắm Dove dưỡng ẩm sâu chai 900ml",
    "Nước giặt OMO Matic cửa trước túi 3.7kg",
    "Rượu vang đỏ Chile Concha y Toro Casillero del Diablo Cabernet Sauvignon 750ml",
    "Dầu gội Head & Shoulders Bạc Hà Mát Lạnh 650ml",
    "Sữa tươi tiệt trùng Vinamilk 100% ít đường hộp 1L",
]


def to_slots(entities: dict) -> dict:
    """Chuyển kết quả extract_entities -> {category, brand, family, variant}."""
    slots = {v: None for v in LABEL_MAP.values()}
    for long_label, values in entities.items():
        key = LABEL_MAP.get(long_label)
        if key and values:
            slots[key] = values[0]  # lấy giá trị đầu tiên
    return slots


def main():
    print(f"Loading {MODEL} ...")
    extractor = GLiNER2.from_pretrained(MODEL)
    print("Loaded.\n")

    # ---- Cách 1: extract_entities (nhanh, mỗi nhãn -> list span) ----
    print("=== Cách 1: extract_entities ===")
    for text in SAMPLES:
        res = extractor.extract_entities(text, LABELS)
        ents = res.get("entities", res)
        slots = to_slots(ents)
        print(f"\nIN : {text}")
        print(f"OUT: {slots}")

    # ---- Cách 2: extract_json (schema có mô tả field) ----
    print("\n\n=== Cách 2: extract_json (schema) ===")
    schema = {
        "product": [
            "category::str::type of product e.g. wine, shampoo, detergent, milk",
            "brand::str::commercial brand name",
            "family::str::product line or series name",
            "variant::str::package specification such as volume, weight or size",
        ]
    }
    for text in SAMPLES:
        res = extractor.extract_json(text, schema)
        print(f"\nIN : {text}")
        print(f"OUT: {res}")


if __name__ == "__main__":
    main()
