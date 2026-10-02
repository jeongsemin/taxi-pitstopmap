"""카카오 로컬 API(주차장 PK6)로 지역별 주차장을 수집해 parking_spots 에 적재한다.

카카오 카테고리 검색은 한 번에 최대 45건만 주므로, 영역을 사각형 타일로 나눠 조회하고
결과가 한도(45건)에 걸리면 타일을 4등분해 다시 조회한다.
첫 페이지의 total_count 만 보고 쪼갤지 정하므로, 쪼갤 타일은 나머지 페이지를 받지 않는다.

지역은 REGIONS 에 있다. 강남구만 받았던 이전 방식은 `--region gangnam` 이다.
호출이 많은 작업이라 --max-calls 로 상한을 둔다 (넘기면 중단하고, 받은 만큼은 저장하지 않는다).

사용법 (프로젝트 루트에서):
    python data/scripts/load_parking_lots.py --region seoul --dry-run
    python data/scripts/load_parking_lots.py --region seoul
"""

import argparse
import json
import os
import sys
import time

import requests
from dotenv import load_dotenv

from load_osm_toilets import ROOT, connect

CATEGORY_URL = "https://dapi.kakao.com/v2/local/search/category.json"
PAGE_CAP = 45
MIN_TILE_DEG = 0.0004  # 약 40m. 이보다 작아지면 더 쪼개지 않는다.
TILE_DEG = 0.01

# 지역별 경계 (서, 남, 동, 북)와 주소 필터. 경계는 사각형이라 이웃 지역이 섞이므로 주소로 거른다.
REGIONS = {
    "gangnam": {"bbox": (127.015, 37.455, 127.135, 37.555), "address": "강남구"},
    "seoul": {"bbox": (126.76, 37.41, 127.19, 37.72), "address": "서울"},
}

UPSERT_SQL = """
insert into parking_spots (name, type, location, address, source, source_id)
values (%s, %s, st_point(%s, %s)::geography, %s, 'kakao', %s)
on conflict (source, source_id) do update set
  name = excluded.name,
  type = excluded.type,
  location = excluded.location,
  address = excluded.address
"""


class CallBudgetExceeded(Exception):
    pass


class Collector:
    def __init__(self, session, max_calls):
        self.session = session
        self.max_calls = max_calls
        self.calls = 0
        self.found: dict[str, dict] = {}

    def get_page(self, rect, page):
        if self.calls >= self.max_calls:
            raise CallBudgetExceeded(f"호출 {self.max_calls}회 상한에 도달했습니다.")
        self.calls += 1
        west, south, east, north = rect
        for attempt in range(3):
            res = self.session.get(
                CATEGORY_URL,
                params={
                    "category_group_code": "PK6",
                    "rect": f"{west},{south},{east},{north}",
                    "size": 15,
                    "page": page,
                },
                timeout=10,
            )
            if res.status_code == 429:  # 호출이 몰렸으면 잠깐 쉬고 다시
                time.sleep(2 * (attempt + 1))
                continue
            res.raise_for_status()
            time.sleep(0.03)
            return res.json()
        res.raise_for_status()

    def collect(self, rect):
        data = self.get_page(rect, 1)
        west, south, east, north = rect
        total = data["meta"]["total_count"]

        # 한도(45건)를 넘으면 받지 않고 바로 쪼갠다
        if total > PAGE_CAP and (east - west) > MIN_TILE_DEG:
            mx, my = (west + east) / 2, (south + north) / 2
            for sub in (
                (west, south, mx, my),
                (mx, south, east, my),
                (west, my, mx, north),
                (mx, my, east, north),
            ):
                self.collect(sub)
            return

        docs = list(data["documents"])
        page = 1
        while not data["meta"]["is_end"] and page < 3:
            page += 1
            data = self.get_page(rect, page)
            docs += data["documents"]
        for d in docs:
            self.found[d["id"]] = d


def classify(name: str) -> str:
    return "public_lot" if "공영" in name else "private_lot"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", choices=sorted(REGIONS), default="gangnam")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-calls", type=int, default=40000)
    args = parser.parse_args()

    load_dotenv(ROOT / ".env.local", encoding="utf-8-sig")
    key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if not key:
        sys.exit("KAKAO_REST_API_KEY 가 .env.local 에 필요합니다.")

    session = requests.Session()
    session.headers["Authorization"] = f"KakaoAK {key}"
    collector = Collector(session, args.max_calls)

    region = REGIONS[args.region]
    west, south, east, north = region["bbox"]
    started = time.time()
    try:
        y = south
        while y < north:
            x = west
            while x < east:
                collector.collect(
                    (x, y, min(x + TILE_DEG, east), min(y + TILE_DEG, north))
                )
                x += TILE_DEG
            y += TILE_DEG
            print(
                f"  위도 {y:.3f} 까지 수집, 누적 {len(collector.found)}건, "
                f"호출 {collector.calls}회, {int(time.time() - started)}초",
                flush=True,
            )
    except CallBudgetExceeded as e:
        sys.exit(f"중단: {e} 적재하지 않았습니다. --max-calls 를 올려 다시 실행하세요.")

    rows = [
        (
            d["place_name"],
            classify(d["place_name"]),
            float(d["x"]),
            float(d["y"]),
            d["road_address_name"] or d["address_name"],
            d["id"],
        )
        for d in collector.found.values()
    ]
    # 경계 사각형에 섞인 이웃 지역 결과는 주소로 제외
    rows = [r for r in rows if r[4] and region["address"] in r[4]]
    public = sum(1 for r in rows if r[1] == "public_lot")
    print(
        f"주차장 {len(rows)}건 (공영 {public} / 민영 {len(rows) - public}), "
        f"카카오 호출 {collector.calls}회"
    )

    # 적재에 실패해도 다시 호출하지 않도록 받은 결과를 저장해 둔다 (data/raw 는 git 제외)
    cache = ROOT / "data" / "raw" / f"parking_{args.region}.json"
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(rows, ensure_ascii=False), encoding="utf-8")

    if args.dry_run:
        return
    if not rows:
        sys.exit("적재할 데이터가 없습니다.")

    with connect() as conn, conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)
    print(f"parking_spots 에 {len(rows)}건 upsert 완료")


if __name__ == "__main__":
    main()
