import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

// 카카오 로컬 API 를 흉내 낸 가짜 fetch 로 캐시·호출 상한·한도 초과 보호를 확인한다.
// 모듈 안에 캐시와 쿨다운 상태가 남으므로, 시험마다 모듈을 새로 불러온다.
type Mod = typeof import("@/lib/kakao-restaurants");
let seq = 0;
const load = () =>
  import(`../src/lib/kakao-restaurants.ts?t${seq++}`) as Promise<Mod>;

type Mode = "ok" | "quota" | "tile500" | "quotaTile";
let mode: Mode = "ok";
let total = 10;
let calls = 0;
let clock = 0;
const realNow = Date.now;
const realFetch = globalThis.fetch;

const doc = (id: number) => ({
  id: String(id),
  place_name: `식당${id}`,
  category_name: "음식점 > 한식",
  road_address_name: `주소${id}`,
  address_name: "",
  phone: "",
  x: "127.03",
  y: "37.50",
  distance: "50",
  place_url: `http://place.map.kakao.com/${id}`,
});

beforeEach(() => {
  mode = "ok";
  total = 10;
  calls = 0;
  clock = realNow();
  Date.now = () => clock;
  globalThis.fetch = (async (input: string | URL | Request) => {
    calls++;
    const u = new URL(String(input));
    const isTile = u.searchParams.has("rect");
    if (mode === "quota") return new Response("{}", { status: 429 });
    if (mode === "tile500" && isTile) return new Response("{}", { status: 500 });
    if (mode === "quotaTile" && isTile) return new Response("{}", { status: 429 });
    const n = isTile ? 5 : Math.min(15, total);
    return Response.json({
      documents: Array.from({ length: n }, (_, i) => doc(calls * 1000 + i)),
      meta: { is_end: n < 15, total_count: total },
    });
  }) as typeof fetch;
});

afterEach(() => {
  Date.now = realNow;
  globalThis.fetch = realFetch;
  delete process.env.KAKAO_MAX_CALLS;
});

test("식당이 적으면 호출이 적고, 같은 조회는 캐시에서 답한다(호출 0)", async () => {
  const m = await load();
  total = 20;
  const r1 = await m.fetchRestaurants(37.1, 127.1, 500, "k");
  assert.equal(r1.calls, 2); // 첫 페이지 + 둘째 페이지
  const r2 = await m.fetchRestaurants(37.1, 127.1, 500, "k");
  assert.equal(r2.calls, 0);
  assert.equal(calls, 2, "캐시 적중이면 카카오를 다시 부르면 안 된다");
});

test("식당이 많으면 격자 조회로 넘어가고 호출은 상한(20)에서 멈춘다", async () => {
  const m = await load();
  total = 800;
  const r = await m.fetchRestaurants(37.2, 127.2, 500, "k");
  assert.equal(r.calls, 20);
  assert.equal(calls, 20);
});

test("KAKAO_MAX_CALLS 로 호출 상한을 낮출 수 있고, 범위 밖 값은 기본값(20)을 쓴다", async () => {
  process.env.KAKAO_MAX_CALLS = "8";
  total = 800;
  const low = await (await load()).fetchRestaurants(37.7, 127.7, 500, "k");
  assert.equal(low.calls, 8);

  process.env.KAKAO_MAX_CALLS = "999";
  const bad = await (await load()).fetchRestaurants(37.71, 127.71, 500, "k");
  assert.equal(bad.calls, 20);
});

test("한도 초과(429): 에러를 던지고, 이후 10분은 카카오를 부르지 않다가 지나면 다시 시도한다", async () => {
  const m = await load();
  mode = "quota";
  await assert.rejects(
    m.fetchRestaurants(37.3, 127.3, 500, "k"),
    (e) => e instanceof m.KakaoQuotaError,
  );
  assert.equal(calls, 1);

  await assert.rejects(
    m.fetchRestaurants(37.31, 127.31, 500, "k"),
    (e) => e instanceof m.KakaoQuotaError,
  );
  assert.equal(calls, 1, "쿨다운 중이라 추가 호출이 없어야 한다");

  clock += 11 * 60_000;
  mode = "ok";
  total = 5;
  const r = await m.fetchRestaurants(37.32, 127.32, 500, "k");
  assert.ok(r.places.length > 0);
  assert.equal(calls, 2);
});

test("카카오가 실패하면 만료된 옛 캐시(6시간 이내)로 대신 답한다", async () => {
  const m = await load();
  total = 5;
  const fresh = await m.fetchRestaurants(37.4, 127.4, 500, "k");
  assert.equal(fresh.stale, undefined);

  clock += 31 * 60_000; // 캐시 만료(30분) 후
  mode = "quota";
  const r = await m.fetchRestaurants(37.4, 127.4, 500, "k");
  assert.equal(r.stale, true);
  assert.equal(r.calls, 0);
  assert.equal(r.places.length, fresh.places.length);
});

test("6시간이 넘은 옛 캐시는 쓰지 않고 에러를 알린다", async () => {
  const m = await load();
  total = 5;
  await m.fetchRestaurants(37.41, 127.41, 500, "k");
  clock += 7 * 60 * 60_000;
  mode = "quota";
  await assert.rejects(
    m.fetchRestaurants(37.41, 127.41, 500, "k"),
    (e) => e instanceof m.KakaoQuotaError,
  );
});

test("일부 칸 조회가 실패하면 partial 로 표시하고 1분만 캐시한다", async () => {
  const m = await load();
  mode = "tile500";
  total = 800;
  const orig = console.error;
  console.error = () => {}; // 의도한 실패 로그가 시험 출력에 섞이지 않게 한다
  try {
    const r = await m.fetchRestaurants(37.5, 127.5, 500, "k");
    assert.equal(r.partial, true);

    const before = calls;
    clock += 2 * 60_000; // 1분 TTL 이 지난 뒤
    mode = "ok";
    await m.fetchRestaurants(37.5, 127.5, 500, "k");
    assert.ok(calls > before, "만료된 partial 결과는 다시 받아야 한다");
  } finally {
    console.error = orig;
  }
});

test("칸 조회 중 한도 초과는 일부 실패로 넘기지 않고 에러로 알린다", async () => {
  const m = await load();
  mode = "quotaTile";
  total = 800;
  await assert.rejects(
    m.fetchRestaurants(37.6, 127.6, 500, "k"),
    (e) => e instanceof m.KakaoQuotaError,
  );
});

test("카카오가 내려주는 http 주소는 https 로 바꿔서 돌려준다", async () => {
  const m = await load();
  total = 3;
  const r = await m.fetchRestaurants(37.8, 127.8, 500, "k");
  assert.ok(r.places.length > 0);
  for (const p of r.places) assert.match(p.url, /^https:\/\//);
});
