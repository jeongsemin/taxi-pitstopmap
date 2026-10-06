// 테스트에서 소스 파일의 `@/` 경로 별칭과 확장자 없는 import 를 풀어 주는 설정을 등록한다.
// (Next.js 는 빌드 때 이 규칙을 처리하지만, node 로 직접 실행할 때는 필요하다.)
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
