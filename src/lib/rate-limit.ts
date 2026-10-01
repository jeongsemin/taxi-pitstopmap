// 서버 인스턴스 메모리 기반의 단순한 호출 제한(슬라이딩 윈도우).
//
// 한계: 서버리스(Vercel)에서는 인스턴스가 여러 개 생기고 재시작되므로 인스턴스마다 따로 센다.
// 한 사용자가 짧은 시간에 반복 호출하는 상황(실수나 단순 반복 호출)을 막는 안전망이고,
// 분산된 공격까지 막으려면 Redis 같은 공유 저장소나 Vercel 방화벽 규칙이 필요하다.
const hits = new Map<string, number[]>();
const MAX_KEYS = 5000;

export type RateLimitResult = { ok: boolean; retryAfterSec: number };

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= limit) {
    hits.set(key, recent);
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((recent[0] + windowMs - now) / 1000),
      ),
    };
  }

  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) prune(now, windowMs);
  return { ok: true, retryAfterSec: 0 };
}

// 오래된 항목을 지워 메모리가 계속 늘지 않게 한다.
function prune(now: number, windowMs: number) {
  for (const [key, times] of hits) {
    if (times.every((t) => now - t >= windowMs)) hits.delete(key);
  }
  // 그래도 많으면 먼저 들어온 것부터 버린다
  for (const key of hits.keys()) {
    if (hits.size <= MAX_KEYS) break;
    hits.delete(key);
  }
}

// 요청한 사용자의 IP. Vercel 등 프록시 뒤에서는 x-forwarded-for 의 첫 번째 값이 실제 사용자다.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
