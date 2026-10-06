import { supabase } from "@/lib/supabase";

// 서버에서 오류를 기록한다. 기록에 실패해도 요청 처리를 막지 않도록 절대 던지지 않는다.
// 좌표·IP·사용자 정보는 넣지 않는다 (경로, 상태 코드 같은 진단 정보만).

export type ServerErrorKind =
  | "places_failed" // 장소 조회가 전부 실패 (502/500)
  | "places_partial" // 식당 또는 화장실 중 한쪽만 실패
  | "score_failed" // 주정차 점수 계산 실패
  | "kakao_quota"; // 카카오 호출 한도 초과 (잠시 식당 조회를 멈춤)

// 어느 배포 버전에서 난 오류인지 알 수 있게 커밋 앞자리를 함께 남긴다.
const RELEASE = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

export async function recordServerError(
  kind: ServerErrorKind,
  message: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  console.error(`[${kind}]`, message);
  try {
    const { error } = await supabase.rpc("log_error", {
      p_source: "server",
      p_kind: kind,
      p_message: message,
      p_detail: detail,
      p_release: RELEASE,
    });
    if (error) console.error("오류 기록 실패:", error.message);
  } catch (e) {
    console.error("오류 기록 실패:", e);
  }
}
