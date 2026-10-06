import { supabaseBrowser } from "@/lib/supabase-browser";
import { reportClientError } from "@/lib/report-client-error";
import type { Place } from "@/types/place";

// parkable 은 이전 화면이 보내던 값(도로변 제보와 같게 취급)이라 새로 보내지는 않는다.
export type ReportType = "store_parking" | "roadside_ok" | "enforced" | "full";

export const REPORT_OPTIONS: {
  value: ReportType;
  label: string;
  className: string;
}[] = [
  {
    value: "store_parking",
    label: "🟢 주차 자리 제공됨",
    className: "bg-good text-on-solid",
  },
  {
    value: "roadside_ok",
    label: "🟢 도로변에 세움",
    className: "bg-good text-on-solid",
  },
  { value: "enforced", label: "🔴 단속됨", className: "bg-bad text-on-solid" },
  { value: "full", label: "⚪ 세울 곳 없었음", className: "bg-chip text-fg" },
];

const ERROR_MESSAGES: Record<string, string> = {
  duplicate_report: "같은 장소에는 10분 뒤에 다시 제보할 수 있어요.",
  rate_limit: "오늘은 제보 한도(30건)에 도달했어요.",
};

// 제보 전에 익명 세션을 보장한다. 이미 세션이 있으면 그대로 쓴다.
async function ensureSession() {
  const { data } = await supabaseBrowser.auth.getSession();
  if (data.session) return;
  const { error } = await supabaseBrowser.auth.signInAnonymously();
  if (error) {
    reportClientError("report_submit", `익명 로그인 실패: ${error.message}`);
    throw new Error(
      "로그인에 실패했어요. 잠시 후 다시 시도해 주세요. (익명 로그인이 꺼져 있을 수 있어요)",
    );
  }
}

export async function submitReport(
  place: Pick<Place, "id" | "name" | "lat" | "lng">,
  type: ReportType,
) {
  await ensureSession();
  const { error } = await supabaseBrowser.from("reports").insert({
    place_key: place.id,
    place_name: place.name,
    lat: place.lat,
    lng: place.lng,
    report_type: type,
  });
  if (error) {
    const known = Object.keys(ERROR_MESSAGES).find((k) =>
      error.message.includes(k),
    );
    // 중복·한도 같은 정상 안내가 아닌 예상 못 한 실패만 기록한다
    if (!known) reportClientError("report_submit", error.message, { type });
    throw new Error(
      known ? ERROR_MESSAGES[known] : "제보를 저장하지 못했어요.",
    );
  }
}
