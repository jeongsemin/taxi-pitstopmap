import assert from "node:assert/strict";
import { test } from "node:test";
import { distanceMeters } from "@/lib/geo";

test("같은 지점 사이의 거리는 0이다", () => {
  const p = { lat: 37.4979, lng: 127.0276 };
  assert.equal(distanceMeters(p, p), 0);
});

test("위도 1도는 약 111km다", () => {
  const d = distanceMeters({ lat: 37, lng: 127 }, { lat: 38, lng: 127 });
  assert.ok(Math.abs(d - 111_195) < 300, `실제 ${d}`);
});

test("방향을 바꿔도 거리가 같다", () => {
  const a = { lat: 37.4979, lng: 127.0276 }; // 강남역
  const b = { lat: 37.5563, lng: 126.9236 }; // 홍대입구
  assert.equal(distanceMeters(a, b), distanceMeters(b, a));
});

test("강남역에서 홍대입구까지는 약 11km다", () => {
  const d = distanceMeters(
    { lat: 37.4979, lng: 127.0276 },
    { lat: 37.5563, lng: 126.9236 },
  );
  assert.ok(d > 10_000 && d < 12_500, `실제 ${d}`);
});
