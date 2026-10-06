"""카카오 로컬 API 호출량(api_usage)을 일별로 보여 준다.

서버가 카카오를 새로 부를 때마다 호출 횟수가 더해진다(캐시에서 답한 요청은 세지 않음).
이 값은 참고용이다. 공개 키로 누구나 값을 부풀릴 수 있어서 정확한 사용량은
카카오 개발자 콘솔의 통계에서 확인해야 한다.

사용법 (프로젝트 루트에서):
    python data/scripts/show_usage.py                  # 최근 7일
    python data/scripts/show_usage.py --days 14
    python data/scripts/show_usage.py --budget 100000  # 하루 한도를 알면 사용률도 표시
"""

import argparse

from load_osm_toilets import connect


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument(
        "--budget",
        type=int,
        default=0,
        help="카카오 로컬 API 하루 한도(건). 콘솔에서 확인한 값을 넣으면 사용률을 보여 준다.",
    )
    args = parser.parse_args()

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select day, calls, requests
            from api_usage
            where kind = 'kakao_local'
              and day > (now() at time zone 'Asia/Seoul')::date - %s
            order by day desc
            """,
            (args.days,),
        )
        rows = cur.fetchall()

    if not rows:
        print("기록이 없습니다. (서버가 카카오를 새로 부르면 쌓입니다)")
        return

    print(f"카카오 로컬 API 호출량 (최근 {args.days}일, 한국 시간 기준)\n")
    header = f"{'날짜':<12}{'호출 수':>9}{'새로 조회':>10}{'조회당 호출':>12}"
    if args.budget:
        header += f"{'한도 대비':>10}"
    print(header)
    for day, calls, requests in rows:
        per = calls / requests if requests else 0
        line = f"{day!s:<12}{calls:>9}{requests:>10}{per:>12.1f}"
        if args.budget:
            line += f"{calls / args.budget * 100:>9.1f}%"
        print(line)

    total_calls = sum(r[1] for r in rows)
    total_requests = sum(r[2] for r in rows)
    print(f"\n합계 {total_calls}회 / 새로 조회 {total_requests}건 "
          f"(조회당 평균 {total_calls / max(total_requests, 1):.1f}회)")
    if args.budget:
        peak = max(r[1] for r in rows)
        print(f"하루 최대 {peak}회 = 한도의 {peak / args.budget * 100:.1f}%")


if __name__ == "__main__":
    main()
