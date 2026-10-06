"""DB 에 있는 규칙(점수 계산, 제보 입력 검증, 기록 함수)을 확인하는 시험.

실행 (프로젝트 루트에서):
    npm run test:db

운영 DB 에 연결하지만 **데이터는 남기지 않는다**: 시험마다 트랜잭션 안에서 가짜 주차장·제보·계정을
넣고 끝나면 모두 되돌린다(rollback). 가짜 주차장은 사람이 없는 서해 한가운데(북위 36, 동경 125)에 두어서
실제 데이터와 섞이지 않는다. .env.local 의 DB 접속 정보가 없으면 건너뛴다.
"""

import json
import sys
import unittest
import uuid
from pathlib import Path

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data" / "scripts"))

try:
    from load_osm_toilets import connect
except SystemExit:  # 접속 정보가 없을 때 connect() 가 종료시키는 경우
    connect = None

# 시험 지점 (서해, 한국 좌표 범위 안)
LAT, LNG = 36.0, 125.0
PLACE = "kakao-900000001"


class DatabaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if connect is None:
            raise unittest.SkipTest("DB 접속 정보(.env.local)가 없어 건너뜁니다")
        try:
            cls.conn = connect()
        except (SystemExit, psycopg2.Error) as e:
            raise unittest.SkipTest(f"DB 에 연결하지 못해 건너뜁니다: {e}")

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def setUp(self):
        self.cur = self.conn.cursor()
        # 실제 데이터와 섞이지 않는지 먼저 확인한다
        self.cur.execute(
            "select count(*) from parking_spots "
            "where st_dwithin(location, st_point(%s,%s)::geography, 2000)",
            (LNG, LAT),
        )
        self.assertEqual(self.cur.fetchone()[0], 0, "시험 지점 근처에 실제 주차장이 있습니다")
        self.lot_seq = 0

    def tearDown(self):
        self.conn.rollback()  # 시험 데이터를 하나도 남기지 않는다
        self.cur.close()

    # ---------------------------------------------------------------- 도구
    def lot(self, name, kind, dist, address=None):
        """시험 지점에서 북쪽으로 dist 미터 떨어진 주차장을 넣는다."""
        self.lot_seq += 1
        self.cur.execute(
            "insert into parking_spots (name, type, location, address, source, source_id) "
            "values (%s, %s, st_project(st_point(%s,%s)::geography, %s, 0), %s, 'test', %s)",
            (name, kind, LNG, LAT, dist, address, f"t{uuid.uuid4().hex}"),
        )

    def covered(self):
        """500m 안에 주차장이 있어서 '데이터 있는 지역'으로 보이게 한다 (점수에는 영향 없음)."""
        self.lot("멀리있는주차장", "private_lot", 400)

    def users(self, n):
        ids = []
        for _ in range(n):
            self.cur.execute("insert into auth.users (id) values (gen_random_uuid()) returning id")
            ids.append(self.cur.fetchone()[0])
        return ids

    def report(self, kind, n=1, key=PLACE, days_ago=0):
        for uid in self.users(n):
            self.cur.execute(
                "insert into reports (place_key, place_name, lat, lng, user_id, report_type, created_at) "
                "values (%s, '시험식당', %s, %s, %s, %s, now() - make_interval(days => %s))",
                (key, LAT, LNG, uid, kind, days_ago),
            )

    def score(self, name=None, address=None, key=PLACE):
        point = {"id": key, "lat": LAT, "lng": LNG}
        if name:
            point["name"] = name
        if address:
            point["address"] = address
        self.cur.execute(
            "select score, no_data, store_parking, store_parking_name, roadside_distance, "
            "reports_store, reports_roadside, reports_enforced, reports_full "
            "from score_places(%s::jsonb)",
            (json.dumps([point]),),
        )
        keys = ("score", "no_data", "store", "store_name", "road_dist", "r_store", "r_road", "r_enf", "r_full")
        return dict(zip(keys, self.cur.fetchone()))

    # ----------------------------------------------------- 데이터가 없을 때
    def test_주차장_데이터도_제보도_없으면_점수_없음(self):
        r = self.score()
        self.assertIsNone(r["score"])
        self.assertTrue(r["no_data"])

    def test_데이터_없는_지역에_제보만_있으면_중립_30점에서_가감한다(self):
        self.report("roadside_ok", 1)
        r = self.score()
        self.assertEqual(r["score"], 45)  # 30 + 도로변 제보 1명 15
        self.assertFalse(r["no_data"])

    # --------------------------------------------- 가게 자체 주차(추정) 근거
    def test_같은_건물이나_30m_이내_민영주차장은_건물_추정_30점(self):
        self.lot("옆건물주차장", "private_lot", 20)
        r = self.score()
        self.assertEqual(r["store"], "building")
        self.assertEqual(r["score"], 35)  # 30 + 민영 100m 이내 보조 5

    def test_주소_끝이_같으면_멀어도_같은_건물로_본다(self):
        self.lot("큰빌딩주차장", "private_lot", 150, address="서울 강남구 테헤란로 152")
        r = self.score(name="입주식당", address="서울 강남구 테헤란로 152")
        self.assertEqual(r["store"], "building")

    def test_가게_이름과_겹치는_민영주차장은_이름일치_40점(self):
        self.lot("맛있는집 주차장", "private_lot", 100)
        r = self.score(name="맛있는집 강남점")
        self.assertEqual(r["store"], "name_match")
        self.assertEqual(r["store_name"], "맛있는집 주차장")
        self.assertEqual(r["score"], 45)  # 40 + 5

    def test_이름이_너무_짧거나_멀면_이름일치로_보지_않는다(self):
        self.lot("강남주차장", "private_lot", 100)  # 정규화하면 2글자
        self.assertNotEqual(self.score(name="강남")["store"], "name_match")

    def test_거주자우선주차장은_점수에서_제외한다(self):
        self.lot("행촌 거주자우선주차장", "private_lot", 10)
        self.covered()
        r = self.score()
        self.assertEqual(r["store"], "none")
        self.assertEqual(r["score"], 0)

    # ------------------------------------------------------------- 도로변
    def test_노상주차장_100m_이내는_도로변_30점(self):
        self.lot("노상공영주차장", "public_lot", 80)
        r = self.score()
        self.assertEqual(r["score"], 30)
        self.assertEqual(r["road_dist"], 80)

    def test_노상주차장이_100m보다_멀면_도로변_점수가_없다(self):
        self.lot("노상공영주차장", "public_lot", 150)
        r = self.score()
        self.assertEqual(r["score"], 0)
        self.assertIsNone(r["road_dist"])

    def test_공영주차장은_가점이_약해서_5점뿐이다(self):
        self.lot("테스트공영주차장", "public_lot", 80)
        self.assertEqual(self.score()["score"], 5)

    def test_주변에_주차장이_10곳_이상이면_보조_5점(self):
        for _ in range(10):
            self.lot("흩어진주차장", "private_lot", 150)
        self.assertEqual(self.score()["score"], 5)

    # ------------------------------------------------------------- 제보
    def test_주차_자리_제공_제보는_1명_50점_2명_60점_이고_추정보다_우선한다(self):
        self.covered()
        self.report("store_parking", 1)
        r = self.score()
        self.assertEqual((r["score"], r["store"], r["r_store"]), (50, "reported", 1))
        self.report("store_parking", 1)
        self.assertEqual(self.score()["score"], 60)

    def test_제보가_이름일치_추정보다_우선한다(self):
        self.lot("맛있는집 주차장", "private_lot", 100)
        self.report("store_parking", 1)
        r = self.score(name="맛있는집")
        self.assertEqual(r["store"], "reported")
        self.assertEqual(r["score"], 55)  # 제보 50 + 보조 5 (추정 40 은 더하지 않는다)

    def test_도로변_제보는_1명_15점_2명_30점_이전_parkable_도_같게_센다(self):
        self.covered()
        self.report("roadside_ok", 1)
        self.assertEqual(self.score()["score"], 15)
        self.report("parkable", 1)  # 이전 화면이 보내던 값
        r = self.score()
        self.assertEqual((r["score"], r["r_road"]), (30, 2))

    def test_도로변_점수는_노상주차장과_제보를_합쳐도_최대_45점(self):
        self.lot("노상공영주차장", "public_lot", 50)
        self.report("roadside_ok", 2)
        self.assertEqual(self.score()["score"], 45)

    def test_단속됨_제보는_1명_20점_2명_이상_40점_감점하고_0점_아래로_내려가지_않는다(self):
        self.lot("옆건물주차장", "private_lot", 20)  # 35점
        self.report("enforced", 1)
        self.assertEqual(self.score()["score"], 15)
        self.report("enforced", 1)
        self.assertEqual(self.score()["score"], 0)  # 35 - 40 → 0 으로 제한

    def test_세울_곳_없음_제보는_1명_10점_2명_이상_15점_감점(self):
        self.lot("옆건물주차장", "private_lot", 20)  # 35점
        self.report("full", 1)
        self.assertEqual(self.score()["score"], 25)
        self.report("full", 1)
        self.assertEqual(self.score()["score"], 20)

    def test_점수는_100점을_넘지_않는다(self):
        self.lot("노상공영주차장", "public_lot", 50)
        self.lot("공영주차장", "public_lot", 60)
        self.lot("옆주차장", "private_lot", 20)
        for _ in range(10):
            self.lot("여럿", "private_lot", 150)
        self.report("store_parking", 2)
        self.report("roadside_ok", 2)
        self.assertEqual(self.score()["score"], 100)

    def test_30일이_지난_제보는_점수에_반영하지_않는다(self):
        self.covered()
        self.report("store_parking", 2, days_ago=31)
        r = self.score()
        self.assertEqual((r["score"], r["r_store"]), (0, 0))

    def test_다른_장소의_제보는_섞이지_않는다(self):
        self.covered()
        self.report("store_parking", 2, key="kakao-900000002")
        self.assertEqual(self.score()["score"], 0)

    # ------------------------------------------------ 제보 입력 검증(DB 규칙)
    def _rejects(self, fn, *needles):
        self.cur.execute("savepoint s")
        with self.assertRaises(psycopg2.Error) as ctx:
            fn()
        self.cur.execute("rollback to savepoint s")
        text = str(ctx.exception)
        self.assertTrue(any(n in text for n in needles), text)

    def _insert_report(self, **over):
        values = dict(
            place_key=PLACE, place_name="시험식당", lat=LAT, lng=LNG,
            user_id=None, report_type="roadside_ok", content=None,
        )
        values.update(over)
        if values["user_id"] is None:
            values["user_id"] = self.users(1)[0]
        self.cur.execute(
            "insert into reports (place_key, place_name, lat, lng, user_id, report_type, content) "
            "values (%(place_key)s, %(place_name)s, %(lat)s, %(lng)s, %(user_id)s, %(report_type)s, %(content)s)",
            values,
        )

    def test_제보_입력_형식을_DB가_검증한다(self):
        self._insert_report()  # 올바른 값은 들어간다
        self._rejects(lambda: self._insert_report(place_key="abc"), "reports_place_key_format")
        self._rejects(lambda: self._insert_report(place_key="kakao-12;drop"), "reports_place_key_format")
        self._rejects(lambda: self._insert_report(place_name=""), "reports_place_name_length")
        self._rejects(lambda: self._insert_report(place_name="가" * 101), "reports_place_name_length")
        self._rejects(lambda: self._insert_report(lat=10.0), "reports_location_in_korea")
        self._rejects(lambda: self._insert_report(lng=140.0), "reports_location_in_korea")
        self._rejects(lambda: self._insert_report(content="가" * 201), "reports_content_length")
        self._rejects(lambda: self._insert_report(report_type="hack"), "reports_report_type_check")

    def test_제보_종류_다섯_가지를_받는다(self):
        for i, kind in enumerate(["store_parking", "roadside_ok", "parkable", "enforced", "full"]):
            self._insert_report(report_type=kind, place_key=f"kakao-90000010{i}")

    def test_같은_사용자가_같은_장소에_10분_안에_다시_제보할_수_없다(self):
        uid = self.users(1)[0]
        self._insert_report(user_id=uid)
        self._rejects(lambda: self._insert_report(user_id=uid), "duplicate_report")
        self._insert_report(user_id=uid, place_key="kakao-900000999")  # 다른 장소는 가능

    def test_한_사용자는_하루_30건까지만_제보할_수_있다(self):
        uid = self.users(1)[0]
        for i in range(30):
            self._insert_report(user_id=uid, place_key=f"kakao-9100{i:05d}")
        self._rejects(lambda: self._insert_report(user_id=uid, place_key="kakao-910099999"), "rate_limit")

    # ---------------------------------------- 오류 기록·동의 기록·호출량 함수
    def test_오류_기록은_길이와_크기를_제한하고_잘못된_출처를_버린다(self):
        self.cur.execute("select count(*) from error_logs")
        before = self.cur.fetchone()[0]
        self.cur.execute("select log_error('hack','x','잘못된 출처')")
        self.cur.execute("select log_error('client','','종류 없음')")
        self.cur.execute(
            "select log_error('client','js_error', repeat('가',1000), "
            "(select jsonb_object_agg('k'||g, repeat('x',200)) from generate_series(1,40) g))"
        )
        self.cur.execute("select count(*) from error_logs")
        self.assertLessEqual(self.cur.fetchone()[0] - before, 1)  # 정상 한 건만 저장 (1분 제한에 걸렸을 수도 있음)
        self.cur.execute("select length(message), detail from error_logs order by id desc limit 1")
        length, detail = self.cur.fetchone()
        if length is not None and length == 300:
            self.assertEqual(detail, {"truncated": True})

    def test_오류_기록은_1분_60건을_넘으면_버린다(self):
        self.cur.execute(
            "select count(*) from error_logs where created_at > now() - interval '1 minute'"
        )
        before = self.cur.fetchone()[0]
        for i in range(80):
            self.cur.execute("select log_error('server','places_partial', %s)", (f"시험 {i}",))
        self.cur.execute(
            "select count(*) from error_logs where created_at > now() - interval '1 minute'"
        )
        self.assertLessEqual(self.cur.fetchone()[0], max(60, before))

    def test_동의_기록은_올바른_값만_저장한다(self):
        cid = str(uuid.uuid4())
        self.cur.execute("select log_consent(%s,'2026-10-06','granted')", (cid,))
        self.cur.execute("select log_consent(%s,'not-a-date','granted')", (cid,))
        self.cur.execute("select log_consent(%s,'2026-10-06','hack')", (cid,))
        self.cur.execute("select action, version from consent_logs where consent_id=%s", (cid,))
        self.assertEqual(self.cur.fetchall(), [("granted", "2026-10-06")])

    def test_동의_기록은_동의_거부_철회만_받는다(self):
        cid = str(uuid.uuid4())
        for action in ("granted", "declined", "withdrawn"):
            self.cur.execute("select log_consent(%s,'2026-10-06',%s)", (cid, action))
        self.cur.execute("select count(*) from consent_logs where consent_id=%s", (cid,))
        self.assertEqual(self.cur.fetchone()[0], 3)

    def test_호출량은_허용된_종류만_더하고_1_40회_범위를_지킨다(self):
        self.cur.execute(
            "select coalesce(sum(calls),0), coalesce(sum(requests),0) from api_usage "
            "where kind='kakao_local' and day=(now() at time zone 'Asia/Seoul')::date"
        )
        calls0, req0 = self.cur.fetchone()
        self.cur.execute("select bump_usage('kakao_local', 20)")
        self.cur.execute("select bump_usage('kakao_local', 3)")
        self.cur.execute("select bump_usage('other', 5)")  # 허용되지 않은 종류
        self.cur.execute("select bump_usage('kakao_local', 0)")  # 범위 밖
        self.cur.execute("select bump_usage('kakao_local', 41)")  # 범위 밖
        self.cur.execute(
            "select sum(calls), sum(requests) from api_usage "
            "where kind='kakao_local' and day=(now() at time zone 'Asia/Seoul')::date"
        )
        calls1, req1 = self.cur.fetchone()
        self.assertEqual((calls1 - calls0, req1 - req0), (23, 2))
        self.cur.execute("select count(*) from api_usage where kind='other'")
        self.assertEqual(self.cur.fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
