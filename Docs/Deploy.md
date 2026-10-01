# 배포 가이드 (Vercel)

> taxi-pitstopmap을 Vercel에 배포하는 순서입니다. 계정 로그인과 API 키 입력은 본인이 직접 해야 하는 단계입니다.

## 0. 배포 전 확인

- [ ] 배포할 코드가 `main` 브랜치에 있다 (Vercel 운영 배포는 `main` 기준)
- [ ] 로컬에서 `npm run build` 가 통과한다
- [ ] Supabase 마이그레이션이 모두 적용되어 있다 (`python data/scripts/apply_migrations.py` → "적용할 마이그레이션이 없습니다.")
- [ ] Supabase에서 **Authentication → Sign In / Providers → Allow anonymous sign-ins** 가 켜져 있다 (제보 기능)

## 1. Vercel 프로젝트 만들기

1. https://vercel.com 에 **GitHub 계정으로 로그인**합니다.
2. **Add New… → Project** 를 누르고 `jeongsemin/taxi-pitstopmap` 저장소를 가져옵니다. (GitHub 저장소 접근 권한 허용이 필요합니다)
3. 설정 화면에서 아래처럼 둡니다. (대부분 자동으로 잡힙니다)
   - Framework Preset: **Next.js**
   - Root Directory: 기본값 (저장소 루트)
   - Production Branch: **main**

> ⚠️ **"여러 서비스(Services)"로 가져오지 마세요.** 저장소에 Python 데이터 스크립트 폴더(`data/`)가 있어서 Vercel이 "Multiple applications detected… Services" 화면을 띄우고 `vercel.json`을 요구할 수 있습니다. 목록에서 **`app` (Next.js, 경로 `/`)** 항목의 **Import single project** 를 눌러 Next.js 앱 하나만 가져오세요. `data/` 는 내 PC에서만 쓰는 스크립트라 배포 대상이 아닙니다.

## 2. 환경변수 4개 등록

**Deploy 를 누르기 전에** Environment Variables 에 아래 4개를 넣습니다. 값은 로컬 `.env.local` 에서 복사합니다.

| 이름 | 값 | 비고 |
| ---- | -- | ---- |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 **JavaScript 키** | 브라우저에 공개되는 값 |
| `KAKAO_REST_API_KEY` | 카카오 **REST API 키** | **서버 전용**. 이름에 `NEXT_PUBLIC_` 을 붙이지 마세요 |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<프로젝트ID>.supabase.co` | `/rest/v1/` 같은 경로는 빼고 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable(anon) 키 | 브라우저에 공개되는 값 |

> ⚠️ **등록하지 않는 것**: `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_HOST` 는 데이터 적재 스크립트(`data/scripts/`)를 내 PC에서 돌릴 때만 쓰는 값입니다. 앱 서버에는 필요 없고, 넣으면 노출 위험만 커집니다.

환경변수를 바꾸면 **다시 배포(Redeploy)해야** 반영됩니다.

## 3. 배포하고 주소 확인

**Deploy** 를 누르면 몇 분 안에 `https://<프로젝트이름>.vercel.app` 형태의 주소가 생깁니다. 이 주소가 **운영 주소**입니다.

> Vercel 개요에 **"No Production Deployment — push to the main branch"** 라고 나오면 첫 배포가 아직 시작되지 않은 것입니다. 가져오기 마지막 단계(통합 검토 후 Deploy)를 끝내거나, `main` 브랜치에 새 커밋을 병합하면 자동으로 배포가 시작됩니다. 이후에는 `main`에 병합될 때마다 자동으로 운영 배포가 갱신됩니다.

> Vercel은 배포(커밋)마다 임시 미리보기 주소도 만듭니다. 카카오에는 **바뀌지 않는 운영 주소 하나**만 등록해서 쓰세요.

## 4. 카카오 개발자 콘솔에 도메인 등록 (필수)

이 단계를 하지 않으면 **지도가 뜨지 않습니다.**

1. 카카오 개발자 콘솔 → 내 애플리케이션 → **앱 설정 → 플랫폼 키** → **JavaScript 키** 선택
2. **JavaScript SDK 도메인**에 운영 주소(`https://<프로젝트이름>.vercel.app`)를 추가하고 저장합니다. (기존 `http://localhost:3000` 은 그대로 둡니다)
3. **REST API 키에는 허용 IP를 걸지 마세요.** Vercel 서버의 IP는 고정되어 있지 않아서 걸면 식당 조회가 막힙니다.

## 5. 배포 확인 (실제 휴대폰에서)

운영 주소를 휴대폰에서 열어 아래를 확인합니다.

- [ ] 지도가 뜬다 (안 뜨면 4번 도메인 등록 확인)
- [ ] 위치 권한 요청이 뜨고, 허용하면 내 위치 기준으로 장소가 나온다 (HTTPS 에서만 위치가 동작합니다)
- [ ] 식당·화장실 마커, 주차 가능 필터, 마커 묶음이 동작한다
- [ ] 장소 상세에서 카카오맵 / 네이버 지도 / T맵 버튼이 앱으로 연결된다 (출발지가 현재 위치로 잡히는지 확인)
- [ ] 제보 버튼이 동작하고 점수가 바뀐다
- [ ] 안드로이드 뒤로가기 버튼이 상세만 닫는다

## 문제 해결

| 증상 | 확인할 것 |
| ---- | -------- |
| 지도가 회색/빈 화면 | 카카오 콘솔의 JavaScript SDK 도메인에 운영 주소가 정확히 들어갔는지 (`https://` 포함, 끝에 `/` 없이) |
| "장소를 불러오지 못했어요" | Vercel 환경변수 4개가 모두 들어갔는지, 넣은 뒤 Redeploy 했는지. Vercel 프로젝트의 Logs 에서 `/api/places` 오류 확인 |
| "요청이 많아 잠시 후 다시 시도해 주세요" | IP당 1분 40회 제한에 걸린 것입니다. 잠시 후 다시 시도 |
| 제보가 "로그인에 실패했어요" | Supabase 에서 익명 로그인(Allow anonymous sign-ins)이 꺼져 있는지 |
| 점수가 전부 "점수 없음" | 강남구 밖입니다. 주차장 데이터는 현재 강남구에만 있습니다 |

## 6. 악용 대응 (공개 전 점검)

코드와 DB 에 넣은 방어:
- `/api/places`: IP당 1분 40회 + 서버 인스턴스 전체 1분 300회 제한, 좌표 범위·반경 검증, CDN 캐시
- 제보(`reports`): 본인 것만 읽기/쓰기(RLS), 같은 장소 10분 재제보 금지, 하루 30건 제한, 입력 형식 검증(장소 id 형식·이름 길이·한국 좌표·내용 200자, `0006` 마이그레이션)

**직접 설정해야 하는 것** (대시보드에서):
- [ ] Supabase → Authentication → **Rate Limits** 에서 익명 로그인(Anonymous sign-ins)의 시간당 한도를 확인 (기본값은 IP당 시간 30회). 계정을 무한히 만들어 제보를 부풀리는 것을 막는 핵심 설정입니다.
- [ ] (선택) Vercel → Firewall 에서 `/api/places` 경로에 IP별 호출 제한 규칙 추가. 서버리스 인스턴스와 상관없이 막아 줍니다.
- [ ] (선택) 악용이 보이면 Supabase → Authentication → Attack Protection 의 CAPTCHA(Turnstile 등)를 익명 로그인에 켭니다. 앱에 토큰 전달 코드가 필요하니 요청해 주세요.

남아 있는 한계: 익명 로그인 구조라 계정을 여러 개 만드는 사용자가 한 장소에 제보를 2건 이상 넣으면 점수가 최대로 움직입니다. 위 한도와 CAPTCHA 로 비용을 올릴 수는 있어도 완전히 막지는 못합니다. 실제 악용이 보이면 제보자 위치 확인이나 신뢰 등급(`profiles.trust_level`) 도입을 검토하세요.

## 알아둘 점

- **호출 제한은 서버 인스턴스별 메모리 방식**이라 서버리스에서는 인스턴스마다 따로 셉니다. 한 사용자의 반복 호출은 막지만, 분산된 대량 호출까지 막으려면 Redis 같은 공유 저장소나 Vercel 방화벽 규칙이 필요합니다.
- 조회 한 번이 카카오 로컬 API를 최대 20회 호출합니다. 카카오 콘솔의 **일일 호출 한도**를 확인하고, 사용량을 지켜보세요.
- Vercel **Hobby 플랜은 비상업적 용도** 기준으로 알고 있습니다. 서비스를 판매·상업적으로 운영할 계획이라면 플랜과 약관을 확인하세요. (제가 약관을 직접 확인하지는 못했습니다)
- 카카오 로컬 API 결과를 DB에 저장해 쓰는 것(주차장 데이터)이 카카오 이용약관상 허용되는지도 상용화 전에 확인하세요.
