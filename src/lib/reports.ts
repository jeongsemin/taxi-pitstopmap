import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Place } from "@/types/place";

export type ReportType = "parkable" | "enforced" | "full";

export const REPORT_OPTIONS: {
  value: ReportType;
  label: string;
  className: string;
}[] = [
  {
    value: "parkable",
    label: "🟢 세울 수 있었음",
    className: "bg-green-600 text-white",
  },
  { value: "enforced", label: "🔴 단속됨", className: "bg-red-600 text-white" },
  { value: "full", label: "⚪ 자리 없음", className: "bg-zinc-600 text-white" },
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
    throw new Error(
      known ? ERROR_MESSAGES[known] : "제보를 저장하지 못했어요.",
    );
  }
}
