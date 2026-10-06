// 화면(브라우저)에서 난 오류를 서버(/api/log)로 보낸다. 브라우저 전용 파일이다.
// 기록에 실패해도 앱 동작에는 영향이 없게 모든 예외를 삼킨다.

export type ClientErrorKind =
  | "js_error"
  | "unhandled_rejection"
  | "render_error"
  | "map_sdk_load"
  | "places_fetch"
  | "report_submit";

// 한 화면 세션에서 보내는 최대 건수와, 같은 오류를 다시 보내지 않기 위한 기록
const MAX_PER_SESSION = 10;
const sent = new Set<string>();

// 브라우저가 자주 내는, 앱과 상관없는 잡음은 보내지 않는다.
const IGNORED = [
  "ResizeObserver loop", // 레이아웃 측정 경고
  "Script error.", // 다른 출처 스크립트 오류 (내용을 알 수 없음)
  "Load failed", // 사파리가 페이지 이동 중 끊긴 요청에 내는 메시지
];

export function reportClientError(
  kind: ClientErrorKind,
  message: string,
  detail: Record<string, unknown> = {},
) {
  try {
    if (typeof window === "undefined") return;
    if (IGNORED.some((s) => message.includes(s))) return;

    const key = `${kind}:${message}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return;
    sent.add(key);

    const payload = JSON.stringify({
      kind,
      message: message.slice(0, 300),
      detail: {
        // 쿼리·해시에는 좌표가 들어갈 수 있어 경로만 보낸다
        path: window.location.pathname,
        ua: navigator.userAgent.slice(0, 120),
        standalone: window.matchMedia("(display-mode: standalone)").matches,
        ...detail,
      },
    });
    void fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 오류 기록 때문에 앱이 깨지지 않게 한다
  }
}
