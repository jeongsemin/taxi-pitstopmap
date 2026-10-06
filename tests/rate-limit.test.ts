import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// 키마다 따로 세므로, 시험끼리 섞이지 않게 시험마다 다른 키를 쓴다.

test("한도 안에서는 모두 통과하고, 한도를 넘으면 막는다", () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(checkRateLimit("rl-basic", 3, 60_000, now + i).ok, true);
  }
  const blocked = checkRateLimit("rl-basic", 3, 60_000, now + 3);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSec >= 1);
});

test("시간 창이 지나면 다시 허용한다", () => {
  const now = 2_000_000;
  for (let i = 0; i < 2; i++) checkRateLimit("rl-window", 2, 1_000, now);
  assert.equal(checkRateLimit("rl-window", 2, 1_000, now + 500).ok, false);
  assert.equal(checkRateLimit("rl-window", 2, 1_000, now + 1_001).ok, true);
});

test("키가 다르면 서로 영향을 주지 않는다", () => {
  const now = 3_000_000;
  checkRateLimit("rl-a", 1, 60_000, now);
  assert.equal(checkRateLimit("rl-a", 1, 60_000, now + 1).ok, false);
  assert.equal(checkRateLimit("rl-b", 1, 60_000, now + 1).ok, true);
});

test("막힌 요청은 한도를 더 쓰지 않는다 (계속 두드려도 창이 밀리지 않음)", () => {
  const now = 4_000_000;
  checkRateLimit("rl-noextend", 1, 1_000, now);
  for (let i = 1; i <= 5; i++) {
    assert.equal(checkRateLimit("rl-noextend", 1, 1_000, now + i * 100).ok, false);
  }
  assert.equal(checkRateLimit("rl-noextend", 1, 1_000, now + 1_001).ok, true);
});

test("retryAfterSec 는 가장 오래된 요청이 빠지기까지 남은 초(올림)다", () => {
  const now = 5_000_000;
  checkRateLimit("rl-retry", 1, 10_000, now);
  const r = checkRateLimit("rl-retry", 1, 10_000, now + 2_500);
  assert.equal(r.ok, false);
  assert.equal(r.retryAfterSec, 8); // 7.5초 남음 → 올림
});

test("clientIp: x-forwarded-for 의 첫 번째 값을 쓰고, 없으면 x-real-ip, 그것도 없으면 unknown", () => {
  assert.equal(
    clientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })),
    "1.1.1.1",
  );
  assert.equal(clientIp(new Headers({ "x-real-ip": "3.3.3.3" })), "3.3.3.3");
  assert.equal(clientIp(new Headers()), "unknown");
});
