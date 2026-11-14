# -*- coding: utf-8 -*-
"""Tạo bản WebP nhẹ cho ảnh sản phẩm — KHÔNG sửa/xóa ảnh JPG gốc.

  assets/img/p1.jpg  →  assets/img/webp/p1.webp      (cạnh dài tối đa 1200px, cho trang chi tiết)
                        assets/img/webp/p1-480.webp  (rộng 480px, cho thẻ sản phẩm)

Đồng thời ghi js/img-manifest.js liệt kê những ảnh đã có bản WebP. Giao diện chỉ dùng WebP cho ảnh
có trong danh sách này; ảnh khác (ảnh admin tải lên sau, ảnh base64…) vẫn dùng đúng đường dẫn gốc.

Chạy lại sau khi thêm ảnh JPG mới:   python tools/make-webp.py      (cần: pip install pillow)
"""
import io, os, sys
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "img")
OUT = os.path.join(SRC, "webp")
os.makedirs(OUT, exist_ok=True)

names, before, after = [], 0, 0
for f in sorted(os.listdir(SRC)):
    if not f.lower().endswith((".jpg", ".jpeg", ".png")):
        continue
    stem = os.path.splitext(f)[0]
    path = os.path.join(SRC, f)
    try:
        im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    except Exception as e:  # ảnh hỏng → bỏ qua, giao diện vẫn dùng ảnh gốc
        print("bo qua", f, e)
        continue
    full = im.copy(); full.thumbnail((1200, 1200), Image.LANCZOS)
    full.save(os.path.join(OUT, stem + ".webp"), "WEBP", quality=80, method=6)
    small = im.copy(); small.thumbnail((480, 720), Image.LANCZOS)
    small.save(os.path.join(OUT, stem + "-480.webp"), "WEBP", quality=76, method=6)
    names.append("assets/img/" + f)
    before += os.path.getsize(path)
    after += os.path.getsize(os.path.join(OUT, stem + "-480.webp"))

with io.open(os.path.join(ROOT, "js", "img-manifest.js"), "w", encoding="utf-8") as fh:
    fh.write("// TỰ SINH bởi tools/make-webp.py — đừng sửa tay. Ảnh gốc nào đã có bản WebP trong assets/img/webp/.\n")
    fh.write("export const WEBP_READY = new Set([\n")
    for n in names:
        fh.write('  "%s",\n' % n)
    fh.write("]);\n")

print("%d anh | JPG goc: %.1f MB | ban 480px WebP: %.2f MB" % (len(names), before / 1e6, after / 1e6))
