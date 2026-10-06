"""최근 오류 기록(error_logs)을 요약해서 보여 준다.

서버와 화면에서 난 오류가 DB 에 쌓이므로, 이 스크립트나 Supabase 대시보드(Table Editor → error_logs)에서 본다.

사용법 (프로젝트 루트에서):
    python data/scripts/show_errors.py              # 최근 24시간
    python data/scripts/show_errors.py --hours 72   # 최근 72시간
    python data/scripts/show_errors.py --latest 30  # 최근 30건 자세히
"""

import argparse

from load_osm_toilets import connect


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--latest", type=int, default=10)
    args = parser.parse_args()

    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select source, kind, left(message, 80), count(*), max(created_at)
            from error_logs
            where created_at > now() - make_interval(hours => %s)
            group by source, kind, left(message, 80)
            order by count(*) desc, max(created_at) desc
            """,
            (args.hours,),
        )
        rows = cur.fetchall()
        total = sum(r[3] for r in rows)
        print(f"최근 {args.hours}시간 오류 {total}건 ({len(rows)}종류)\n")
        for source, kind, message, count, last in rows:
            print(f"{count:>4}회  [{source}/{kind}] {message}  (마지막 {last:%m-%d %H:%M})")

        if rows and args.latest > 0:
            print(f"\n--- 최근 {args.latest}건 ---")
            cur.execute(
                """
                select created_at, source, kind, message, detail, release
                from error_logs order by created_at desc limit %s
                """,
                (args.latest,),
            )
            for created, source, kind, message, detail, release in cur.fetchall():
                print(
                    f"{created:%m-%d %H:%M:%S} [{source}/{kind}] {message}"
                    f" | 버전 {release or '-'} | {detail}"
                )


if __name__ == "__main__":
    main()
