// 테스트용 "next/server". after() 는 실제 요청 안에서만 쓸 수 있어서, 테스트에서는 아무 일도 하지 않는 함수로 바꾼다.
// (오류 기록처럼 응답 뒤에 하는 일은 여기서 확인하지 않는다.)
import { createRequire } from "node:module";

const real = createRequire(import.meta.url)("next/server");
export const NextRequest = real.NextRequest;
export const NextResponse = real.NextResponse;
export const after = () => {};
