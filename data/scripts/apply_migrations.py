"""supabase/migrations/*.sql 중 아직 적용되지 않은 것을 파일명 순서대로 DB에 적용한다.

적용 이력은 schema_migrations 테이블에 기록한다.
이력 테이블이 생기기 전에 이미 적용된 0001, 0002 는 places 테이블이 있으면 적용된 것으로 간주한다.

사용법: python data/scripts/apply_migrations.py
"""

from load_osm_toilets import ROOT, connect

LEGACY_APPLIED = ("0001_create_places.sql", "0002_parking_spots_and_score.sql")


def main():
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            "create table if not exists schema_migrations "
            "(name text primary key, applied_at timestamptz not null default now())"
        )
        cur.execute("select count(*) from schema_migrations")
        if cur.fetchone()[0] == 0:
            cur.execute("select to_regclass('public.places') is not null")
            if cur.fetchone()[0]:
                for name in LEGACY_APPLIED:
                    cur.execute(
                        "insert into schema_migrations (name) values (%s) on conflict do nothing",
                        (name,),
                    )

        cur.execute("select name from schema_migrations")
        applied = {row[0] for row in cur.fetchall()}

        pending = [f for f in files if f.name not in applied]
        if not pending:
            print("적용할 마이그레이션이 없습니다.")
        for f in pending:
            cur.execute(f.read_text(encoding="utf-8"))
            cur.execute("insert into schema_migrations (name) values (%s)", (f.name,))
            print(f"적용: {f.name}")


if __name__ == "__main__":
    main()
