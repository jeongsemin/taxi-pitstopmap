import { supabase } from "@/lib/supabase";

// 카카오 호출량을 일별로 더해 둔다 (python data/scripts/show_usage.py 로 본다).
// 참고용 지표라서 기록에 실패해도 요청 처리에는 영향이 없고, 이 값으로 기능을 막지 않는다.
export async function recordKakaoUsage(calls: number): Promise<void> {
  if (!Number.isInteger(calls) || calls < 1) return;
  try {
    const { error } = await supabase.rpc("bump_usage", {
      p_kind: "kakao_local",
      p_calls: Math.min(calls, 40),
    });
    if (error) console.error("호출량 기록 실패:", error.message);
  } catch (e) {
    console.error("호출량 기록 실패:", e);
  }
}
