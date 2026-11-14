# -*- coding: utf-8 -*-
"""Chuyển nhãn sản phẩm từ viết cứng (difficulty / petSafe) sang dữ liệu quản lý được.

Thêm 2 bảng vào db.json (chỉ thêm nếu chưa có — chạy lại nhiều lần vẫn an toàn):
  labelGroups : nhóm nhãn. Mỗi nhóm độc lập, có kiểu chọn riêng:
                  single → mỗi sản phẩm chỉ 1 nhãn trong nhóm (vd Độ khó chăm sóc)
                  multi  → gán được nhiều nhãn (vd An toàn & lưu ý)
  labels      : nhãn thuộc 1 nhóm (tên, màu, mô tả, thứ tự).
                  petSafe=true: nhãn này tính là "an toàn với thú cưng" cho bộ lọc Gợi ý chọn cây.
Và gán products[].labelIds dựa trên dữ liệu cũ:
  difficulty "Dễ chăm" / "Trung bình" / "Cần chú ý"  → nhãn tương ứng trong nhóm Độ khó
  petSafe true   → "An toàn với thú cưng"
  petSafe false  → "Để xa thú cưng" (thay cho nhãn cũ "Không ăn được (độc nhẹ)")
Các trường cũ (difficulty, petSafe) được GIỮ NGUYÊN để chatbot / bộ lọc quiz tiếp tục chạy.

Chạy:  python tools/migrate-labels.py     (json-server đang chạy ở chế độ thường sẽ tự nạp lại file)
"""
import io, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATH = os.path.join(ROOT, "db.json")

GROUPS = [
    {"id": "care", "name": "Độ khó chăm sóc", "description": "Cây dễ hay khó chăm. Mỗi cây chỉ thuộc một mức.", "selection": "single", "order": 1},
    {"id": "safety", "name": "An toàn & lưu ý", "description": "Lưu ý khi nhà có thú cưng hoặc trẻ nhỏ. Một cây có thể mang nhiều nhãn.", "selection": "multi", "order": 2},
]
LABELS = [
    {"id": "care-easy", "groupId": "care", "name": "Dễ chăm", "color": "green", "description": "Chịu được quên tưới, ít sâu bệnh — hợp người mới.", "order": 1},
    {"id": "care-medium", "groupId": "care", "name": "Trung bình", "color": "amber", "description": "Cần để ý nước và ánh sáng đều đặn.", "order": 2},
    {"id": "care-hard", "groupId": "care", "name": "Cần chú ý", "color": "red", "description": "Kén điều kiện — nên có chút kinh nghiệm.", "order": 3},
    {"id": "safe-pet", "groupId": "safety", "name": "An toàn với thú cưng", "color": "green", "description": "Không độc với chó mèo.", "petSafe": True, "order": 1},
    {"id": "keep-from-pet", "groupId": "safety", "name": "Để xa thú cưng", "color": "amber", "description": "Nhựa/lá có thể gây khó chịu nếu chó mèo gặm phải.", "order": 2},
    {"id": "keep-from-kids", "groupId": "safety", "name": "Để xa tầm tay trẻ nhỏ", "color": "amber", "description": "Có gai, nhựa hoặc lá không nên để trẻ nhỏ chạm, ngậm.", "order": 3},
]
DIFF = {"Dễ chăm": "care-easy", "Trung bình": "care-medium", "Cần chú ý": "care-hard"}

with io.open(PATH, encoding="utf-8") as fh:
    db = json.load(fh)

added = []
if "labelGroups" not in db:
    db["labelGroups"] = GROUPS; added.append("labelGroups")
if "labels" not in db:
    db["labels"] = LABELS; added.append("labels")

migrated = 0
for p in db.get("products", []):
    if isinstance(p.get("labelIds"), list):
        continue  # đã gán rồi → không ghi đè lựa chọn của admin
    ids = []
    if p.get("difficulty") in DIFF:
        ids.append(DIFF[p["difficulty"]])
    if p.get("petSafe") is True:
        ids.append("safe-pet")
    elif p.get("petSafe") is False:
        ids.append("keep-from-pet")
    p["labelIds"] = ids
    migrated += 1

with io.open(PATH, "w", encoding="utf-8") as fh:
    json.dump(db, fh, ensure_ascii=False, indent=2)

print("them bang:", added or "khong (da co)", "| san pham duoc gan nhan:", migrated)
