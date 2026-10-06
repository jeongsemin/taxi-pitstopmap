import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// 화면(브라우저)에서 난 오류를 받아 DB 에 기록한다. 공개 주소라 입력을 엄격히 제한한다.
// 응답은 항상 204 로 같게 해서, 기록 여부나 제한 여부를 바깥에 알려 주지 않는다.

// 허용하는 오류 종류 (이 밖의 값은 버린다)
const CLIENT_KINDS = new Set([
  "js_error", // 화면 자바스크립트 오류
  "unhandled_rejection", // 처리되지 않은 비동기 오류
  "render_error", // 화면 그리기 중 오류(error.tsx)
  "map_sdk_load", // 카카오 지도 불러오기 실패
  "places_fetch", // 장소 조회 실패
  "report_submit", // 제보 저장 실패
]);

const MAX_BODY_CHARS = 4000;
const RATE_LIMIT = 20; // IP 당 1분
const RATE_WINDOW_MS = 60_000;
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

const empty = () => new Response(null, { status: 204 });

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(
    `log:${clientIp(request.headers)}`,
    RATE_LIMIT,
    RATE_WINDOW_MS,
  );
  if (!limited.ok) return empty();

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return empty();
    body = JSON.parse(text);
  } catch {
    return empty();
  }

  const { kind, message, detail } = (body ?? {}) as {
    kind?: unknown;
    message?: unknown;
    detail?: unknown;
  };
  if (typeof kind !== "string" || !CLIENT_KINDS.has(kind)) return empty();

  const safeDetail =
    detail && typeof detail === "object" && !Array.isArray(detail)
      ? detail
      : {};

  const { error } = await supabase.rpc("log_error", {
    p_source: "client",
    p_kind: kind,
    p_message: typeof message === "string" ? message : "",
    p_detail: safeDetail,
    p_release: RELEASE,
  });
  if (error) console.error("화면 오류 기록 실패:", error.message);
  return empty();
}
