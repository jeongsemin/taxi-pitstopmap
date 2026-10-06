import type { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// 위치정보 이용 동의·거부·철회를 기록한다. 공개 주소라 입력을 엄격히 제한하고,
// 응답은 항상 204 로 같게 해서 기록 여부나 제한 여부를 바깥에 알려 주지 않는다.

const ACTIONS = new Set(["granted", "declined", "withdrawn"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^\d{4}-\d{2}-\d{2}$/;

const MAX_BODY_CHARS = 500;
const RATE_LIMIT = 10; // IP 당 1분
const RATE_WINDOW_MS = 60_000;

const empty = () => new Response(null, { status: 204 });

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(
    `consent:${clientIp(request.headers)}`,
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

  const { consentId, version, action } = (body ?? {}) as {
    consentId?: unknown;
    version?: unknown;
    action?: unknown;
  };
  if (
    typeof consentId !== "string" ||
    !UUID.test(consentId) ||
    typeof version !== "string" ||
    !VERSION.test(version) ||
    typeof action !== "string" ||
    !ACTIONS.has(action)
  ) {
    return empty();
  }

  const { error } = await supabase.rpc("log_consent", {
    p_consent_id: consentId,
    p_version: version,
    p_action: action,
  });
  if (error) console.error("동의 기록 실패:", error.message);
  return empty();
}
