"""OSM Overpass에서 화장실을 수집해 Supabase places 테이블에 적재한다.

사용법 (프로젝트 루트에서):
    pip install -r data/requirements.txt
    python data/scripts/load_osm_toilets.py            # 강남구 (기본)
    python data/scripts/load_osm_toilets.py --area 서울특별시 --level 4   # 서울 전체
    python data/scripts/load_osm_toilets.py --dry-run  # DB 적재 없이 수집만

DB 접속 정보는 .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_PASSWORD,
(IPv4 환경이면) SUPABASE_DB_HOST 를 사용한다.
"""

import argparse
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

QUERY = """
[out:json][timeout:90];
area["name"="{area}"]["boundary"="administrative"]["admin_level"="{level}"]->.a;
(
  node["amenity"="toilets"](area.a);
  way["amenity"="toilets"](area.a);
);
out center tags;
"""

UPSERT_SQL = """
insert into places
  (name, type, location, address, open_hours, is_24h, source, source_id)
values
  (%s, 'toilet', st_point(%s, %s)::geography, %s, %s, %s, 'osm', %s)
on conflict (source, source_id) do update set
  name = excluded.name,
  location = excluded.location,
  address = excluded.address,
  open_hours = excluded.open_hours,
  is_24h = excluded.is_24h
"""


def fetch_toilets(area: str, level: str = "6", retries: int = 3) -> list[dict]:
    headers = {"User-Agent": "taxi-pitstopmap/0.1 (data loader)"}
    last_error = None
    for attempt in range(retries):
        for url in OVERPASS_URLS:
            try:
                res = requests.post(
                    url, data={"data": QUERY.format(area=area, level=level)}, headers=headers, timeout=120
                )
                res.raise_for_status()
                return res.json()["elements"]
            except (requests.RequestException, ValueError) as e:
                last_error = e
                print(f"Overpass 실패 ({url}): {e}", file=sys.stderr)
        wait = 20 * (attempt + 1)
        print(f"{wait}초 후 재시도 ({attempt + 1}/{retries})", file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f"모든 Overpass 서버 실패: {last_error}")


def to_row(el: dict):
    tags = el.get("tags", {})
    lat = el.get("lat") or el.get("center", {}).get("lat")
    lng = el.get("lon") or el.get("center", {}).get("lon")
    if lat is None or lng is None:
        return None

    name = tags.get("name") or tags.get("name:ko") or "공중화장실"
    street = tags.get("addr:street", "")
    number = tags.get("addr:housenumber", "")
    address = f"{street} {number}".strip() or None
    open_hours = tags.get("opening_hours")
    is_24h = open_hours == "24/7"
    return (name, lng, lat, address, open_hours, is_24h, f"{el['type']}/{el['id']}")


def connect():
    load_dotenv(ROOT / ".env.local", encoding="utf-8-sig")
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    password = os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    match = re.search(r"([a-z0-9]+)\.supabase\.co", url)
    if not match or not password:
        sys.exit(
            "NEXT_PUBLIC_SUPABASE_URL 에서 프로젝트 ref 를 찾지 못했거나 "
            "SUPABASE_DB_PASSWORD 가 비어 있습니다. (https://<ref>.supabase.co 형식 필요)"
        )
    ref = match.group(1)
    # 직접 접속(db.<ref>.supabase.co)은 IPv6 전용이라, IPv4 환경에서는
    # Connect 화면의 Session pooler 호스트를 SUPABASE_DB_HOST 로 지정한다.
    pooler_host = os.environ.get("SUPABASE_DB_HOST", "").strip()
    host = pooler_host or f"db.{ref}.supabase.co"
    user = f"postgres.{ref}" if pooler_host else "postgres"
    return psycopg2.connect(
        host=host,
        port=5432,
        dbname="postgres",
        user=user,
        password=password,
        sslmode="require",
        connect_timeout=15,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--area", default="강남구")
    parser.add_argument("--level", default="6", help="행정구역 단계 (구=6, 시·도=4)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    elements = fetch_toilets(args.area, args.level)
    rows = [r for r in (to_row(e) for e in elements) if r]
    print(f"{args.area} 화장실 {len(rows)}건 수집")
    if not rows:
        sys.exit("수집 결과가 0건입니다. Overpass 응답을 확인하세요. (적재 중단)")

    if args.dry_run:
        for r in rows[:5]:
            print(r)
        return

    with connect() as conn, conn.cursor() as cur:
        cur.executemany(UPSERT_SQL, rows)
    print(f"places 테이블에 {len(rows)}건 upsert 완료")


if __name__ == "__main__":
    main()
