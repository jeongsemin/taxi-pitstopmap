"""PWA 아이콘(public/icon-*.png, apple-icon.png)을 생성한다.

노란 배경 위에 지도 핀 모양. 배경을 가장자리까지 채우고 그림은 중앙 안전 영역 안에만 두어
'maskable'(원형·둥근 사각형으로 잘려도 안전)과 일반 아이콘을 겸한다.

    python data/scripts/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (254, 229, 0)  # 카카오 노랑 (앱 라이트 테마 브랜드 색)
INK = (25, 25, 25)
SCALE = 4  # 슈퍼샘플링으로 가장자리를 부드럽게

OUT = Path(__file__).resolve().parents[2] / "public"


def draw_icon(size: int) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)

    cx, cy, r = 0.5 * s, 0.44 * s, 0.19 * s
    tip = (0.5 * s, 0.74 * s)
    # 핀 머리(원) + 꼬리(삼각형)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)
    d.polygon([(cx - r * 0.92, cy + r * 0.38), (cx + r * 0.92, cy + r * 0.38), tip], fill=INK)
    # 가운데 구멍
    h = 0.075 * s
    d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=BG)

    return img.resize((size, size), Image.LANCZOS)


for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-icon.png", 180)]:
    draw_icon(size).save(OUT / name, optimize=True)
    print("saved", OUT / name)
