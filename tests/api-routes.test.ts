import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

// 공개 API 의 입력 검증과 호출 제한을 확인한다. 외부(Supabase)는 가짜 fetch 로 대신하고,
// 잘못된 입력은 외부를 아예 부르지 않는지(fetch 호출 수 0)까지 본다.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

const realFetch = globalThis.fetch;
let fetched: { url: string; body: unknown }[] = [];

beforeEach(() => {
  fetched = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    fetched.push({
      url: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

let ipSeq = 0;
// 시험마다 다른 IP 를 써서 호출 제한이 서로 섞이지 않게 한다
const newIp = () => `10.0.${Math.floor(ipSeq / 250)}.${(ipSeq++ % 250) + 1}`;

function post(path: string, body: unknown, ip = newIp()) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// ------------------------------------------------------------- /api/log

test("/api/log: 올바른 화면 오류는 기록 함수(log_error)를 한 번 부른다", async () => {
  const { POST } = await import("@/app/api/log/route");
  const res = await POST(
    post("/api/log", { kind: "map_sdk_load", message: "지도 실패", detail: { host: "x" } }),
  );
  assert.equal(res.status, 204);
  assert.equal(fetched.length, 1);
  assert.ok(fetched[0].url.endsWith("/rest/v1/rpc/log_error"));
  const body = fetched[0].body as Record<string, unknown>;
  assert.equal(body.p_source, "client");
  assert.equal(body.p_kind, "map_sdk_load");
  assert.deepEqual(body.p_detail, { host: "x" });
});

test("/api/log: 허용되지 않은 종류, JSON 아님, 너무 큰 본문은 외부를 부르지 않고 조용히 204", async () => {
  const { POST } = await import("@/app/api/log/route");
  for (const body of [
    { kind: "hack", message: "x" },
    { message: "종류 없음" },
    "이건 JSON 이 아님",
    { kind: "js_error", message: "큼", detail: { x: "a".repeat(5000) } },
  ]) {
    const res = await POST(post("/api/log", body));
    assert.equal(res.status, 204);
  }
  assert.equal(fetched.length, 0);
});

test("/api/log: detail 이 객체가 아니면 빈 객체로 바꿔 기록한다", async () => {
  const { POST } = await import("@/app/api/log/route");
  await POST(post("/api/log", { kind: "js_error", message: "m", detail: [1, 2] }));
  assert.deepEqual((fetched[0].body as Record<string, unknown>).p_detail, {});
});

test("/api/log: IP 당 분당 20건을 넘으면 기록하지 않고 버린다 (응답은 같게 204)", async () => {
  const { POST } = await import("@/app/api/log/route");
  const ip = newIp();
  for (let i = 0; i < 25; i++) {
    const res = await POST(post("/api/log", { kind: "js_error", message: `m${i}` }, ip));
    assert.equal(res.status, 204);
  }
  assert.equal(fetched.length, 20);
});

// --------------------------------------------------------- /api/consent

const goodConsent = {
  consentId: "123e4567-e89b-12d3-a456-426614174000",
  version: "2026-10-06",
  action: "granted",
};

test("/api/consent: 올바른 동의 기록은 log_consent 를 한 번 부른다", async () => {
  const { POST } = await import("@/app/api/consent/route");
  const res = await POST(post("/api/consent", goodConsent));
  assert.equal(res.status, 204);
  assert.equal(fetched.length, 1);
  assert.ok(fetched[0].url.endsWith("/rest/v1/rpc/log_consent"));
  assert.deepEqual(fetched[0].body, {
    p_consent_id: goodConsent.consentId,
    p_version: "2026-10-06",
    p_action: "granted",
  });
});

test("/api/consent: 잘못된 번호·버전·동작은 외부를 부르지 않는다", async () => {
  const { POST } = await import("@/app/api/consent/route");
  for (const body of [
    { ...goodConsent, consentId: "not-a-uuid" },
    { ...goodConsent, version: "2026-10" },
    { ...goodConsent, action: "hack" },
    { ...goodConsent, consentId: 123 },
    "이건 JSON 이 아님",
  ]) {
    const res = await POST(post("/api/consent", body));
    assert.equal(res.status, 204);
  }
  assert.equal(fetched.length, 0);
});

test("/api/consent: 동의·거부·철회 세 가지 동작을 모두 받는다", async () => {
  const { POST } = await import("@/app/api/consent/route");
  for (const action of ["granted", "declined", "withdrawn"]) {
    await POST(post("/api/consent", { ...goodConsent, action }));
  }
  assert.equal(fetched.length, 3);
});

test("/api/consent: IP 당 분당 10건을 넘으면 기록하지 않는다", async () => {
  const { POST } = await import("@/app/api/consent/route");
  const ip = newIp();
  for (let i = 0; i < 15; i++) await POST(post("/api/consent", goodConsent, ip));
  assert.equal(fetched.length, 10);
});

// ---------------------------------------------------------- /api/places

function get(query: string, ip = newIp()) {
  return new NextRequest(`http://localhost/api/places?${query}`, {
    headers: { "x-forwarded-for": ip },
  });
}

test("/api/places: lat, lng 가 없거나 숫자가 아니면 400 이고 외부를 부르지 않는다", async () => {
  const { GET } = await import("@/app/api/places/route");
  for (const q of ["", "lat=37.5", "lng=127", "lat=abc&lng=127", "lat=37.5&lng=NaN"]) {
    const res = await GET(get(q));
    assert.equal(res.status, 400, q);
  }
  assert.equal(fetched.length, 0);
});

test("/api/places: 대한민국 밖 좌표는 400 이다", async () => {
  const { GET } = await import("@/app/api/places/route");
  for (const q of ["lat=10&lng=127", "lat=37.5&lng=100", "lat=45&lng=127", "lat=37.5&lng=140"]) {
    const res = await GET(get(q));
    assert.equal(res.status, 400, q);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /서비스 지역/);
  }
  assert.equal(fetched.length, 0);
});

test("/api/places: IP 당 분당 40회를 넘으면 429 와 Retry-After 를 돌려주고 캐시하지 않는다", async () => {
  const { GET } = await import("@/app/api/places/route");
  const ip = newIp();
  for (let i = 0; i < 40; i++) {
    const res = await GET(get("lat=10&lng=127", ip)); // 잘못된 좌표라 외부를 부르지 않는다
    assert.equal(res.status, 400);
  }
  const blocked = await GET(get("lat=10&lng=127", ip));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  assert.equal(blocked.headers.get("Cache-Control"), "no-store");
});
