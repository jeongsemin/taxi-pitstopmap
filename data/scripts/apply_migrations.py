"""supabase/migrations/*.sql 을 파일명 순서대로 DB에 적용한다. (idempotent SQL 전제)

사용법: python data/scripts/apply_migrations.py
"""

from pathlib import Path

from load_osm_toilets import ROOT, connect


def main():
    files = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
    with connect() as conn, conn.cursor() as cur:
        for f in files:
            cur.execute(f.read_text(encoding="utf-8"))
            print(f"적용: {f.name}")


if __name__ == "__main__":
    main()
