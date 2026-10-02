"""전국공중화장실표준데이터(localdata.go.kr CSV)를 지오코딩해 places 테이블에 적재한다.

원천 데이터는 2025-02 이후 좌표가 빠져 있어, 카카오 로컬 API로 주소를 좌표로 변환한다.

사용법 (프로젝트 루트에서):
    python data/scripts/load_public_toilets.py --dry-run          # 지오코딩만 (DB 미접속)
    python data/scripts/load_public_toilets.py                    # 적재
    python data/scripts/load_public_toilets.py --csv data/raw/x.csv

CSV 받는 곳: 공공데이터포털 전국공중화장실표준데이터(data.go.kr/data/15012892/standard.do)의 다운로드 버튼
(주소를 직접 입력하면 403 이 날 수 있으니 페이지의 버튼으로 받는다). 서울: data/raw/공중화장실정보_서울특별시.csv
필요한 환경변수(.env.local): KAKAO_REST_API_KEY (+ 적재 시 DB 접속 정보)
"""

import argparse
import json
import os
import sys
import time

import pandas as pd
import requests
from dotenv import load_dotenv

from load_osm_toilets import ROOT, connect

DEFAULT_CSV = ROOT / "data" / "raw" / "gangnam_restroom.csv"
CACHE_PATH = ROOT / "data" / "raw" / "geocode_cache.json"
ADDRESS_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
DEDUP_METERS = 30

UPSERT_SQL = """
insert into places
  (name, type, location, address, phone, open_hours, is_24h, source, source_id)
values
  (%s, 'toilet', st_point(%s, %s)::geography, %s, %s, %s, %s, 'public', %s)
on conflict (source, source_id) do update set
  name = excluded.name,
  location = excluded.location,
  address = excluded.address,
  phone = excluded.phone,
  open_hours = excluded.open_hours,
  is_24h = excluded.is_24h
"""

# 같은 장소가 OSM에도 있으면 공식 데이터를 남기고 OSM 쪽을 지운다.
DEDUP_SQL = """
delete from places o
using places p
where o.source = 'osm' and o.type = 'toilet'
  and p.source = 'public' and p.type = 'toilet'
  and st_dwithin(o.location, p.location, %s)
"""


# 서울 경계 사각형. 주소 오타나 엉뚱한 지오코딩 결과(다른 도시 등)를 거른다.
SEOUL_BBOX = (126.76, 37.41, 127.19, 37.72)  # 서, 남, 동, 북

ALWAYS_OPEN = ("24시간", "24/7", "상시", "00:00~24:00", "00:00~00:00", "00~24")


def clean(value):
    return None if pd.isna(value) else str(value).strip() or None


def is_always_open(detail, basic) -> bool:
    """24시간 열려 있는 화장실인지. 개방시간 표기가 제각각이라 흔한 표기를 모두 본다."""
    text = detail or basic or ""
    return any(token in text for token in ALWAYS_OPEN)


def in_seoul(lng, lat) -> bool:
    west, south, east, north = SEOUL_BBOX
    return west <= lng <= east and south <= lat <= north


def load_cache() -> dict:
    if CACHE_PATH.exists():
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    return {}


def geocode(session: requests.Session, query: str, name: str):
    """도로명주소 -> (lng, lat). 실패하면 '주소 + 이름' 키워드 검색으로 재시도."""
    res = session.get(ADDRESS_URL, params={"query": query}, timeout=10)
    res.raise_for_status()
    docs = res.json().get("documents", [])
    if docs:
        return float(docs[0]["x"]), float(docs[0]["y"])

    res = session.get(KEYWORD_URL, params={"query": f"{query} {name}"}, timeout=10)
    res.raise_for_status()
    docs = res.json().get("documents", [])
    if docs:
        return float(docs[0]["x"]), float(docs[0]["y"])
    return None


def build_rows(df: pd.DataFrame, key: str):
    cache = load_cache()
    session = requests.Session()
    session.headers["Authorization"] = f"KakaoAK {key}"

    rows, failed = [], []
    for i, r in df.iterrows():
        addr = clean(r["소재지도로명주소"]) or clean(r["소재지지번주소"])
        name = clean(r["화장실명"]) or "공중화장실"
        if clean(r["구분명"]) == "이동화장실":
            continue
        if not addr:
            failed.append((name, "주소 없음"))
            continue

        if addr not in cache:
            try:
                cache[addr] = geocode(session, addr, name)
            except requests.RequestException as e:
                failed.append((name, f"API 오류: {e}"))
                continue
            time.sleep(0.05)
        coord = cache[addr]
        if not coord:
            failed.append((name, f"좌표 없음: {addr}"))
            continue
        if not in_seoul(*coord):
            failed.append((name, f"서울 밖 좌표: {addr}"))
            continue

        detail = clean(r["개방시간상세"]) or clean(r["개방시간"])
        rows.append(
            (
                name,
                coord[0],
                coord[1],
                addr,
                clean(r["전화번호"]),
                detail,
                is_always_open(detail, clean(r["개방시간"])),
                str(r["관리번호"]),
            )
        )
        if (i + 1) % 100 == 0:
            print(f"  지오코딩 {i + 1}/{len(df)}")

    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return rows, failed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env.local", encoding="utf-8-sig")
    key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if not key:
        sys.exit("KAKAO_REST_API_KEY 가 .env.local 에 필요합니다.")

    df = pd.read_csv(args.csv, encoding="cp949", dtype=str)
    print(f"CSV {len(df)}행 로드")

    rows, failed = build_rows(df, key)
    print(f"좌표 변환 성공 {len(rows)}건 / 실패 {len(failed)}건")
    for name, why in failed[:10]:
        print(f"  실패: {name} ({why})")

    if not rows:
        sys.exit("적재할 데이터가 없습니다.")
    if args.dry_run:
        for row in rows[:3]:
            print(row)
        return

    with connect() as conn, conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)
        cur.execute(DEDUP_SQL, (DEDUP_METERS,))
        print(f"OSM 중복 {cur.rowcount}건 제거")
    print(f"places 테이블에 {len(rows)}건 upsert 완료")


if __name__ == "__main__":
    main()
