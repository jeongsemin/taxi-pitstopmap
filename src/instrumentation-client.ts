// 브라우저에서 앱이 뜨기 전에 한 번 실행된다. 화면에서 처리되지 않은 오류를 모아서 보낸다.
import { reportClientError } from "@/lib/report-client-error";

window.addEventListener("error", (event) => {
  // 이미지·스크립트 불러오기 실패 같은 자원 오류는 event.error 가 없어서 건너뛴다
  if (!event.error && !event.message) return;
  reportClientError("js_error", event.message || String(event.error), {
    stack: event.error?.stack?.slice(0, 1000),
    source: event.filename?.split("/").pop(),
    line: event.lineno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message =
    reason instanceof Error ? reason.message : String(reason ?? "알 수 없음");
  reportClientError("unhandled_rejection", message, {
    stack: reason instanceof Error ? reason.stack?.slice(0, 1000) : undefined,
  });
});
