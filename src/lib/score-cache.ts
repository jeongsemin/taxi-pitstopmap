import type { ParkingScore } from "@/lib/parking";

// 장소별 주차 점수를 서버 인스턴스 메모리에 잠깐 보관한다.
// 사용자가 조금씩 움직이면 조회 반경이 크게 겹치므로, 이미 점수를 아는 장소는 DB 에 다시 묻지 않는다.
// (밀집 지역은 점수 계산이 DB 에서 가장 무거운 부분이다.)
//
// 제보가 점수에 반영되는 시간: 다른 사용자의 제보는 이 캐시와 CDN 캐시를 거쳐 최대 몇 분 뒤에 보인다.
// 본인이 제보한 직후에는 화면이 캐시 우회 값(r)을 붙여 이 캐시도 건너뛰므로 바로 보인다.
// 서버리스에서는 인스턴스마다 따로 갖는다.

export type ScoreCache = {
  // 유효한 점수만 돌려준다. includeStale 이면 만료됐어도 보관 기간 안의 점수를 돌려준다.
  read(
    ids: string[],
    opts?: { now?: number; includeStale?: boolean },
  ): Map<string, ParkingScore>;
  write(entries: [string, ParkingScore][], now?: number): void;
  size(): number;
};

type Entry = { expires: number; staleUntil: number; value: ParkingScore };

export function createScoreCache(
  ttlMs: number,
  staleMaxMs: number,
  maxEntries: number,
): ScoreCache {
  const map = new Map<string, Entry>();
  return {
    read(ids, { now = Date.now(), includeStale = false } = {}) {
      const out = new Map<string, ParkingScore>();
      for (const id of ids) {
        const e = map.get(id);
        if (!e) continue;
        if (e.expires > now || (includeStale && e.staleUntil > now)) {
          out.set(id, e.value);
        }
      }
      return out;
    },
    write(entries, now = Date.now()) {
      for (const [id, value] of entries) {
        // 지웠다가 다시 넣어 가장 최근 순서로 만든다
        map.delete(id);
        map.set(id, {
          expires: now + ttlMs,
          staleUntil: now + staleMaxMs,
          value,
        });
      }
      // 너무 많아지면 오래 전에 넣은 것부터 버린다
      for (const id of map.keys()) {
        if (map.size <= maxEntries) break;
        map.delete(id);
      }
    },
    size: () => map.size,
  };
}

// 2분: 다른 사용자의 제보가 늦어지는 시간을 CDN 캐시(2분)와 같은 수준으로 맞춘다.
// 점수 조회가 실패했을 때는 1시간 안의 옛 점수라도 보여 준다.
export const scoreCache = createScoreCache(120_000, 3_600_000, 20_000);
