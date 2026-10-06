import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_PARKING_SCORE,
  isParkable,
  LEVEL_STYLE,
  parkingLevel,
} from "@/lib/parking";

test("점수 등급: 60 이상 가능, 30~59 불확실, 30 미만 어려움, 점수 없으면 알 수 없음", () => {
  assert.equal(parkingLevel(100), "good");
  assert.equal(parkingLevel(60), "good");
  assert.equal(parkingLevel(59), "unsure");
  assert.equal(parkingLevel(30), "unsure");
  assert.equal(parkingLevel(29), "hard");
  assert.equal(parkingLevel(0), "hard");
  assert.equal(parkingLevel(null), "unknown");
});

test("'주차 가능' 필터는 30점 이상(불확실 이상)만 통과시키고, 점수 없음은 제외한다", () => {
  assert.equal(isParkable(30), true);
  assert.equal(isParkable(100), true);
  assert.equal(isParkable(29), false);
  assert.equal(isParkable(0), false);
  assert.equal(isParkable(null), false);
});

test("점수를 아직 못 붙인 장소의 기본값은 점수 없음이고 제보도 0이다", () => {
  assert.equal(EMPTY_PARKING_SCORE.score, null);
  assert.equal(parkingLevel(EMPTY_PARKING_SCORE.score), "unknown");
  assert.equal(EMPTY_PARKING_SCORE.storeParking.kind, "none");
  assert.equal(EMPTY_PARKING_SCORE.roadside, null);
  assert.deepEqual(EMPTY_PARKING_SCORE.reports, {
    store: 0,
    roadside: 0,
    enforced: 0,
    full: 0,
  });
});

test("모든 등급에 표시 문구와 색이 있다", () => {
  for (const level of ["good", "unsure", "hard", "unknown"] as const) {
    assert.ok(LEVEL_STYLE[level].label.length > 0);
    assert.match(LEVEL_STYLE[level].color, /^#[0-9a-f]{6}$/i);
  }
});
