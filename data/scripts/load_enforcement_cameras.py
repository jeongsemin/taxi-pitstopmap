"""서울시 불법주정차/전용차로 위반 단속 CCTV 위치정보를 enforcement_cameras 에 적재한다.

원천: 서울 열린데이터광장 OA-20471 (공공누리 1유형, 출처표시). 분기마다 갱신되므로
받은 파일의 전체 내용으로 테이블을 통째로 바꾼다.

CSV 받는 곳: https://data.seoul.go.kr/dataList/OA-20471/S/1/datasetView.do 의 '내려받기(CSV)'
(cp949 인코딩) → data/raw/cctv_seoul.csv

사용법 (프로젝트 루트에서):
    python data/scripts/load_enforcement_cameras.py --dry-run
    python data/scripts/load_enforcement_cameras.py
"""

import argparse
import sys

import pandas as pd

from load_osm_toilets import ROOT, connect

DEFAULT_CSV = ROOT / "data" / "raw" / "cctv_seoul.csv"
SEOUL_BBOX = (126.76, 37.41, 127.19, 37.72)  # 서, 남, 동, 북

INSERT_SQL = """
insert into enforcement_cameras (location, address, district, point_name, kind)
values (st_point(%s, %s)::geography, %s, %s, %s, %s)
"""


def clean(value):
    return None if pd.isna(value) else str(value).strip() or None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(DEFAULT_CSV))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    df = pd.read_csv(args.csv, encoding="cp949", dtype=str)
    print(f"CSV {len(df)}행 로드")

    west, south, east, north = SEOUL_BBOX
    rows, skipped = [], 0
    for _, r in df.iterrows():
        lat = pd.to_numeric(r["위도"], errors="coerce")
        lng = pd.to_numeric(r["경도"], errors="coerce")
        if pd.isna(lat) or pd.isna(lng) or not (
            south <= lat <= north and west <= lng <= east
        ):
            skipped += 1
            continue
        rows.append(
            (
                float(lng),
                float(lat),
                clean(r["고정형CCTV지번주소"]),
                clean(r["자치구"]),
                clean(r["단속지점명"]),
                clean(r["현장구분"]) or "불법주정차구역",
            )
        )
    print(f"적재 대상 {len(rows)}건 (좌표 없음·서울 밖 {skipped}건 제외)")
    if not rows:
        sys.exit("적재할 데이터가 없습니다.")
    if args.dry_run:
        print(rows[0])
        return

    with connect() as conn, conn.cursor() as cur:
        cur.execute("delete from enforcement_cameras")
        cur.executemany(INSERT_SQL, rows)
    print(f"enforcement_cameras 를 {len(rows)}건으로 교체했습니다.")


if __name__ == "__main__":
    main()
