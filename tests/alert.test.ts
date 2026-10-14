import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

// 오류 알림 메일: 설정 전에는 아무것도 보내지 않고, 켜지면 Resend 로 한 통만 보내며, 실패해도 던지지 않는다.
type Body = { to?: string[]; from?: string; subject?: string; text?: string; p_alert?: boolean };
type Call = { url: string; init?: RequestInit; body: Body };

const realFetch = globalThis.fetch;
let calls: Call[] = [];
let logErrorResult: unknown = null;
let resendStatus = 200;
let resendThrows = false;

beforeEach(() => {
  calls = [];
  logErrorResult = null;
  resendStatus = 200;
  resendThrows = false;
  delete process.env.RESEND_API_KEY;
  delete process.env.ALERT_EMAIL_TO;
  delete process.env.ALERT_EMAIL_FROM;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init, body: typeof init?.body === "string" ? JSON.parse(init.body) : {} });
    if (url.startsWith("https://api.resend.com/")) {
      if (resendThrows) throw new Error("network down");
      return new Response("{}", { status: resendStatus });
    }
    if (url.endsWith("/rpc/log_error")) {
      return new Response(JSON.stringify(logErrorResult), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const info = {
  source: "server" as const,
  kind: "places_failed",
  message: "카카오 실패",
  release: "abc1234",
  count_1h: 3,
  count_24h: 9,
};
const mails = () => calls.filter((c) => c.url.startsWith("https://api.resend.com/"));
const enable = () => {
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.ALERT_EMAIL_TO = "me@example.com";
};

test("알림 설정(API 키·받는 주소)이 둘 다 있어야 켜진다", async () => {
  const { alertConfigured } = await import("@/lib/alert");
  assert.equal(alertConfigured(), false);
  process.env.RESEND_API_KEY = "k";
  assert.equal(alertConfigured(), false);
  process.env.ALERT_EMAIL_TO = "  ";
  assert.equal(alertConfigured(), false);
  process.env.ALERT_EMAIL_TO = "me@example.com";
  assert.equal(alertConfigured(), true);
});

test("설정이 없으면 메일을 보내지 않는다", async () => {
  const { sendAlertEmail } = await import("@/lib/alert");
  await sendAlertEmail(info);
  assert.equal(calls.length, 0);
});

test("메일은 Resend 로 한 통, 제목에 종류, 본문에 내용·횟수·배포 버전이 들어간다", async () => {
  enable();
  const { sendAlertEmail } = await import("@/lib/alert");
  await sendAlertEmail(info);
  assert.equal(mails().length, 1);
  const m = mails()[0];
  assert.equal(m.url, "https://api.resend.com/emails");
  assert.equal((m.init?.headers as Record<string, string>).Authorization, "Bearer re_test_key");
  assert.deepEqual(m.body.to, ["me@example.com"]);
  assert.match(m.body.from ?? "", /onboarding@resend\.dev/);
  assert.equal(m.body.subject, "[쉼터지도] 오류 알림: places_failed");
  for (const part of ["카카오 실패", "abc1234", "최근 1시간 3회", "최근 24시간 9회", "서버"]) {
    assert.ok((m.body.text ?? "").includes(part), `본문에 '${part}' 가 있어야 함`);
  }
});

test("보내는 주소(ALERT_EMAIL_FROM)와 여러 받는 주소(쉼표)를 지원한다", async () => {
  enable();
  process.env.ALERT_EMAIL_TO = "a@example.com, b@example.com";
  process.env.ALERT_EMAIL_FROM = "알림 <alert@mydomain.com>";
  const { sendAlertEmail } = await import("@/lib/alert");
  await sendAlertEmail(info);
  assert.deepEqual(mails()[0].body.to, ["a@example.com", "b@example.com"]);
  assert.equal(mails()[0].body.from, "알림 <alert@mydomain.com>");
});

test("종류에 이상한 글자가 있으면 제목에 그대로 넣지 않는다", async () => {
  enable();
  const { sendAlertEmail } = await import("@/lib/alert");
  for (const kind of ["x\r\nBcc: evil@example.com", "Bcc: evil@example.com", "UPPER", "a".repeat(41)]) {
    await sendAlertEmail({ ...info, kind });
  }
  assert.equal(mails().length, 4);
  for (const m of mails()) assert.equal(m.body.subject, "[쉼터지도] 오류 알림: 기타");
});

test("메일 발송이 실패(HTTP 오류·네트워크 오류)해도 던지지 않는다", async () => {
  enable();
  const { sendAlertEmail } = await import("@/lib/alert");
  resendStatus = 500;
  await sendAlertEmail(info);
  resendThrows = true;
  await sendAlertEmail(info);
  assert.equal(mails().length, 2);
});

test("log_error 의 반환값이 알림 정보일 때만 해석하고, 아니면 null", async () => {
  const { parseAlertInfo } = await import("@/lib/alert");
  assert.equal(parseAlertInfo(null), null);
  assert.equal(parseAlertInfo("x"), null);
  assert.equal(parseAlertInfo([1]), null);
  assert.equal(parseAlertInfo({ message: "종류 없음" }), null);
  const got = parseAlertInfo({
    source: "client",
    kind: "js_error",
    message: "m",
    release: null,
    count_1h: "2",
    count_24h: 5,
  });
  assert.deepEqual(got, {
    source: "client",
    kind: "js_error",
    message: "m",
    release: null,
    count_1h: 2,
    count_24h: 5,
  });
});

test("서버 오류 기록: 설정이 없으면 알림을 요청하지 않고 메일도 없다", async () => {
  const { recordServerError } = await import("@/lib/error-log");
  await recordServerError("places_failed", "실패");
  const rpc = calls.find((c) => c.url.endsWith("/rpc/log_error"))!;
  assert.equal(rpc.body.p_alert, false);
  assert.equal(mails().length, 0);
});

test("서버 오류 기록: 설정이 있어도 DB 가 허락하지 않으면(같은 종류 60분 안) 메일은 없다", async () => {
  enable();
  logErrorResult = null;
  const { recordServerError } = await import("@/lib/error-log");
  await recordServerError("places_failed", "실패");
  assert.equal(calls.find((c) => c.url.endsWith("/rpc/log_error"))!.body.p_alert, true);
  assert.equal(mails().length, 0);
});

test("서버 오류 기록: DB 가 허락하면 메일을 한 통 보낸다", async () => {
  enable();
  logErrorResult = { ...info };
  const { recordServerError } = await import("@/lib/error-log");
  await recordServerError("places_failed", "실패");
  assert.equal(mails().length, 1);
  assert.equal(mails()[0].body.subject, "[쉼터지도] 오류 알림: places_failed");
});
