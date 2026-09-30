"""카카오 로컬 API(주차장 PK6)로 강남구 주차장을 수집해 parking_spots 에 적재한다.

카카오 카테고리 검색은 한 번에 최대 45건만 주므로, 영역을 사각형 타일로 나눠 조회하고
결과가 한도(45건)에 걸리면 타일을 4등분해 다시 조회한다.

사용법 (프로젝트 루트에서):
    python data/scripts/load_parking_lots.py --dry-run
    python data/scripts/load_parking_lots.py
"""

import argparse
import os
import sys
import time

import requests
from dotenv import load_dotenv

from load_osm_toilets import ROOT, connect

CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json"
PAGE_CAP = 45
MIN_TILE_DEG = 0.0004  # 약 40m. 이보다 작아지면 더 쪼개지 않는다.

# 강남구 대략적인 경계 (서, 남, 동, 북)
GANGNAM_BBOX = (127.015, 37.455, 127.135, 37.555)
TILE_DEG = 0.01

UPSERT_SQL = """
insert into parking_spots (name, type, location, address, source, source_id)
values (%s, %s, st_point(%s, %s)::geography, %s, 'kakao', %s)
on conflict (source, source_id) do update set
  name = excluded.name,
  type = excluded.type,
  location = excluded.location,
  address = excluded.address
"""


def query_rect(session, rect):
    """사각형 하나를 조회한다. (docs, 한도에 걸렸는지)"""
    west, south, east, north = rect
    docs = []
    for page in range(1, 4):
        res = session.get(
            CATEGORY_URL,
            params={
                "category_group_code": "PK6",
                "rect": f"{west},{south},{east},{north}",
                "size": 15,
                "page": page,
            },
            timeout=10,
        )
        res.raise_for_status()
        data = res.json()
        docs += data["documents"]
        if data["meta"]["is_end"]:
            break
        time.sleep(0.03)
    # total_count 는 실제 전체 건수, 한 번에 받을 수 있는 건 최대 45건
    return docs, data["meta"]["total_count"] > PAGE_CAP


def collect(session, rect, found):
    docs, capped = query_rect(session, rect)
    west, south, east, north = rect
    if capped and (east - west) > MIN_TILE_DEG:
        mx, my = (west + east) / 2, (south + north) / 2
        for sub in (
            (west, south, mx, my),
            (mx, south, east, my),
            (west, my, mx, north),
            (mx, my, east, north),
        ):
            collect(session, sub, found)
        return
    for d in docs:
        found[d["id"]] = d


def classify(name: str) -> str:
    return "public_lot" if "공영" in name else "private_lot"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env.local", encoding="utf-8-sig")
    key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if not key:
        sys.exit("KAKAO_REST_API_KEY 가 .env.local 에 필요합니다.")

    session = requests.Session()
    session.headers["Authorization"] = f"KakaoAK {key}"

    west, south, east, north = GANGNAM_BBOX
    found: dict[str, dict] = {}
    y = south
    while y < north:
        x = west
        while x < east:
            collect(session, (x, y, min(x + TILE_DEG, east), min(y + TILE_DEG, north)), found)
            x += TILE_DEG
        y += TILE_DEG
        print(f"  위도 {y:.3f} 까지 수집, 누적 {len(found)}건")

    rows = [
        (
            d["place_name"],
            classify(d["place_name"]),
            float(d["x"]),
            float(d["y"]),
            d["road_address_name"] or d["address_name"],
            d["id"],
        )
        for d in found.values()
    ]
    # 강남구 밖 결과는 제외 (주소에 '강남구' 포함 여부로 판단)
    rows = [r for r in rows if r[4] and "강남구" in r[4]]
    public = sum(1 for r in rows if r[1] == "public_lot")
    print(f"주차장 {len(rows)}건 (공영 {public} / 민영 {len(rows) - public})")

    if args.dry_run:
        return
    if not rows:
        sys.exit("적재할 데이터가 없습니다.")

    with connect() as conn, conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)
    print(f"parking_spots 에 {len(rows)}건 upsert 완료")


if __name__ == "__main__":
    main()
