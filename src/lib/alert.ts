// 오류 알림 메일. 오류가 기록될 때 DB(log_error)가 "알려도 된다"고 판단하면 여기서 메일을 보낸다.
// 메일은 Resend(https://resend.com) API 로 보낸다. 환경변수 RESEND_API_KEY 와 ALERT_EMAIL_TO 가 둘 다 있어야 켜진다.
//   - Resend 의 기본 보내는 주소(onboarding@resend.dev)는 Resend 가입 메일로만 보낼 수 있다.
//     다른 주소로 보내려면 Resend 에서 도메인을 인증하고 ALERT_EMAIL_FROM 을 설정한다.
// 알림이 실패해도 요청 처리를 막지 않도록 절대 던지지 않는다.

export type AlertInfo = {
  source: "server" | "client";
  kind: string;
  message: string;
  release: string | null;
  count_1h: number;
  count_24h: number;
};

const DEFAULT_FROM = "쉼터지도 알림 <onboarding@resend.dev>";
const SEND_TIMEOUT_MS = 8000;

export function alertConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.ALERT_EMAIL_TO?.trim();
}

// 공개 함수로 들어온 값이 메일 제목에 그대로 들어가지 않게 영문 소문자와 밑줄만 허용한다.
function safeKind(kind: unknown): string {
  return typeof kind === "string" && /^[a-z_]{1,40}$/.test(kind) ? kind : "기타";
}

function buildBody(info: AlertInfo): string {
  const when = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date());
  return [
    `쉼터지도에서 오류가 발생했어요. (${when})`,
    "",
    `종류: ${safeKind(info.kind)} (${info.source === "server" ? "서버" : "화면"})`,
    `내용: ${String(info.message ?? "").slice(0, 300) || "(없음)"}`,
    `배포 버전: ${info.release ?? "알 수 없음"}`,
    `같은 종류 발생 횟수: 최근 1시간 ${info.count_1h}회 / 최근 24시간 ${info.count_24h}회`,
    "",
    "같은 종류의 오류는 60분에 한 번만 알려 드려요. 하루 최대 20통입니다.",
    "자세한 내용: python data/scripts/show_errors.py 또는 Supabase 대시보드 → Table Editor → error_logs",
  ].join("\n");
}

export async function sendAlertEmail(info: AlertInfo): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ALERT_EMAIL_TO?.trim();
  if (!key || !to) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM?.trim() || DEFAULT_FROM,
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `[쉼터지도] 오류 알림: ${safeKind(info.kind)}`,
        text: buildBody(info),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) console.error("오류 알림 메일 발송 실패:", res.status);
  } catch (e) {
    console.error("오류 알림 메일 발송 실패:", e);
  }
}

// log_error 의 반환값이 알림 정보인지 확인한다 (알림이 아니면 null)
export function parseAlertInfo(data: unknown): AlertInfo | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.kind !== "string") return null;
  return {
    source: d.source === "client" ? "client" : "server",
    kind: d.kind,
    message: typeof d.message === "string" ? d.message : "",
    release: typeof d.release === "string" ? d.release : null,
    count_1h: Number(d.count_1h) || 0,
    count_24h: Number(d.count_24h) || 0,
  };
}
