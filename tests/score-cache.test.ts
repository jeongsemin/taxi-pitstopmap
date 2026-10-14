import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";
import { createScoreCache } from "@/lib/score-cache";
import { EMPTY_PARKING_SCORE, type ParkingScore } from "@/lib/parking";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
process.env.KAKAO_REST_API_KEY ??= "test-kakao-key";

const score = (n: number): ParkingScore => ({ ...EMPTY_PARKING_SCORE, score: n });

// ---------------------------------------------------------- 캐시 자체

test("점수 캐시: 유효 기간 안에는 돌려주고, 지나면 돌려주지 않는다", () => {
  const c = createScoreCache(1000, 10_000, 100);
  c.write([["a", score(1)]], 0);
  assert.equal(c.read(["a"], { now: 999 }).get("a")?.score, 1);
  assert.equal(c.read(["a"], { now: 1000 }).size, 0);
});

test("점수 캐시: includeStale 이면 보관 기간 안의 만료된 점수도 돌려준다", () => {
  const c = createScoreCache(1000, 10_000, 100);
  c.write([["a", score(1)]], 0);
  assert.equal(c.read(["a"], { now: 5000, includeStale: true }).get("a")?.score, 1);
  assert.equal(c.read(["a"], { now: 10_000, includeStale: true }).size, 0);
});

test("점수 캐시: 최대 개수를 넘으면 오래 전에 넣은 것부터 버린다", () => {
  const c = createScoreCache(1000, 10_000, 3);
  c.write([["a", score(1)], ["b", score(2)], ["c", score(3)]], 0);
  c.write([["a", score(11)]], 1); // a 를 다시 넣어 가장 최근으로 만든다
  c.write([["d", score(4)]], 2);
  assert.equal(c.size(), 3);
  const got = c.read(["a", "b", "c", "d"], { now: 3 });
  assert.deepEqual([...got.keys()].sort(), ["a", "c", "d"]); // 가장 오래된 b 가 버려짐
  assert.equal(got.get("a")?.score, 11);
});

// ---------------------------------------------------------- /api/places 가 캐시를 쓰는지

const realFetch = globalThis.fetch;
let scoreCalls: string[][] = [];
let scoreFails = false;
let toiletIds: number[] = [];

beforeEach(() => {
  scoreCalls = [];
  scoreFails = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), {
        status,
        headers: { "content-type": "application/json" },
      });
    if (url.endsWith("/rpc/nearby_places")) {
      return json(
        toiletIds.map((id) => ({
          id, name: `화장실${id}`, phone: null, open_hours: null, is_24h: false,
          lat: 37.5, lng: 127.0, address: "서울", distance: 10,
        })),
      );
    }
    if (url.endsWith("/rpc/score_places")) {
      scoreCalls.push(body.points.map((p: { id: string }) => p.id));
      if (scoreFails) return json({ message: "boom" }, 500);
      return json(
        body.points.map((p: { id: string }) => ({
          id: p.id, score: 50, nearest_lot_distance: 10, nearest_lot_name: "주차장",
          reasons: [], store_parking: "none", store_parking_name: null,
          roadside_distance: null, roadside_name: null,
          reports_store: 0, reports_roadside: 0, reports_enforced: 0, reports_full: 0,
          no_data: false,
        })),
      );
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

let seq = 0;
async function get(ids: number[], extra = "") {
  toiletIds = ids;
  const { GET } = await import("@/app/api/places/route");
  const res = await GET(
    new NextRequest(
      `http://localhost/api/places?lat=37.5&lng=127.0&radius=500&type=toilet${extra}`,
      { headers: { "x-forwarded-for": `10.20.0.${(seq++ % 250) + 1}` } },
    ),
  );
  return { res, body: await res.json() };
}

// 시험끼리 장소 번호가 겹치지 않게 100 단위로 나눠 쓴다 (점수 캐시는 파일 안에서 공유된다)
test("/api/places: 이미 점수를 아는 장소는 DB 에 다시 묻지 않고 새 장소만 묻는다", async () => {
  const first = await get([101, 102, 103]);
  assert.equal(first.res.status, 200);
  assert.deepEqual(scoreCalls, [["db-101", "db-102", "db-103"]]);

  const second = await get([102, 103, 104]);
  assert.deepEqual(scoreCalls[1], ["db-104"]); // 겹치는 둘은 캐시에서
  assert.equal(second.body.scored, true);
  assert.equal(second.body.places.length, 3);
  for (const p of second.body.places) assert.equal(p.parking.score, 50);

  await get([102, 103, 104]); // 전부 아는 장소면 점수 조회를 아예 하지 않는다
  assert.equal(scoreCalls.length, 2);
});

test("/api/places: 캐시 우회 값(r)이 있으면 점수 캐시를 읽지 않고 전부 다시 묻는다 (제보 직후)", async () => {
  await get([201, 202]);
  await get([201, 202], "&r=abc");
  assert.deepEqual(scoreCalls, [["db-201", "db-202"], ["db-201", "db-202"]]);
});

test("/api/places: 점수 조회가 실패하면 옛 점수로 보여 주되 실패(scored=false)로 알린다", async () => {
  await get([301, 302]); // 점수를 캐시에 채운다
  scoreFails = true;
  const { res, body } = await get([301, 302, 303], "&r=x"); // r 로 캐시 읽기를 건너뛰어 조회를 시도하게 한다
  assert.equal(res.status, 200);
  assert.equal(body.scored, false);
  assert.equal(res.headers.get("cache-control"), "no-store"); // 실패한 응답은 CDN 에 남기지 않는다
  const byId = new Map(body.places.map((p: { id: string; parking: ParkingScore }) => [p.id, p.parking]));
  assert.equal((byId.get("db-301") as ParkingScore).score, 50); // 옛 점수
  assert.equal((byId.get("db-303") as ParkingScore).score, null); // 점수를 모르는 장소
});
