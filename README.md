# 🚕 taxi-pitstopmap

> 택시 기사를 위한 **주정차 가능 식당·화장실** 안내 서비스

![status](https://img.shields.io/badge/status-in%20development-blue)
![stack](https://img.shields.io/badge/stack-Next.js%20%7C%20Supabase%20%7C%20Kakao%20Map-blue)

<!-- 개발 후 스크린샷 또는 GIF를 여기에 추가하세요 -->
<!-- ![demo](docs/images/demo.gif) -->

## 📌 프로젝트 소개

택시 기사는 식사와 화장실이 급해도, 근처에 식당이나 화장실이 있더라도 **차를 세울 곳이 없어** 헤매거나 주정차 단속을 걱정해야 합니다.
기존 지도 앱은 "장소"는 알려주지만 "그 앞에 차를 세울 수 있는지"는 알려주지 않습니다.

**taxi-pitstopmap**은 현재 위치에서 _차를 세우고 바로 이용할 수 있는_ 식당과 화장실을 보여줍니다.

## 🎯 프로젝트 목표

- 실제 택시 기사의 불편을 해결하는 서비스 구현
- 바이브 코딩(AI 활용 개발) 학습 및 개발 과정 기록
- 동작하는 데모와 실사용자 피드백 확보

## ✨ 주요 기능

### MVP

- [x] 현재 위치 기반 지도 표시
- [x] 주변 식당·화장실 검색 (반경 조절)
- [x] 장소별 주정차 점수 표시 (🟢 가능 / 🟡 불확실 / 🔴 어려움)
- [x] 장소 상세 정보 및 길찾기 연결 (카카오맵 웹 링크, T맵 앱 스킴)
- [x] 식당 / 화장실 / 주차 가능 필터

### 예정

- [ ] 사용자 제보 (주정차 가능·단속 여부)
- [ ] 즐겨찾기, 최근 이용 장소
- [ ] 24시간 영업 필터
- [ ] 큰 버튼 UI 및 음성 안내
- [ ] 시간대별 단속 정보

## 🧠 핵심 아이디어: 주정차 점수

주정차 가능 여부를 직접 제공하는 무료 API는 없기 때문에, 세 가지 데이터를 조합합니다.

| 데이터 층   | 출처                                              | 신뢰도               |
| ----------- | ------------------------------------------------- | -------------------- |
| 공식 데이터 | 공공주차장, 주정차 허용/금지 구간                 | 높음 (커버리지 낮음) |
| 추정 데이터 | 자체 주차장 여부, 인근 공영주차장 거리, 도로 유형 | 중간                 |
| 사용자 제보 | 기사들의 "세울 수 있음 / 단속됨" 제보             | 시간이 갈수록 높아짐 |

**설계상 점수 예시**: 자체 주차장(+40) + 100m 내 공영주차장(+30) + 최근 30일 내 "가능" 제보(+30) − "단속됨" 제보(−40)

**현재 구현된 점수 (1차, 제보 반영 전)**

| 조건 | 점수 |
| ---- | ---- |
| 공영주차장 100m 이내 / 200m 이내 | +50 / +30 |
| 민영주차장 100m 이내 / 200m 이내 | +30 / +15 |
| 200m 이내 주차장 3곳 이상 | +10 |

합계 100점 상한, 🟢 60 이상 · 🟡 30~59 · 🔴 30 미만. 규칙은 [`supabase/migrations/0002_parking_spots_and_score.sql`](supabase/migrations/0002_parking_spots_and_score.sql)의 `score_places()` 한 곳에서 조정합니다.
가중치는 가정값이며 실제 기사 피드백으로 검증되지 않았습니다. 자체 주차장 여부와 공식 주정차 구간 데이터는 아직 반영하지 않았습니다.

## 🏗 아키텍처

```
[모바일 웹앱 (PWA)]
        │
        ▼
[백엔드 API]  ──►  [PostgreSQL + PostGIS (Supabase)]
        │
        ├─► 카카오 로컬 API (식당·장소 검색)
        ├─► 공공데이터포털 (공중화장실, 주차장)
        ├─► OpenStreetMap / Overpass API
        └─► 카카오맵 JS SDK
```

## 🛠 기술 스택

| 영역         | 기술                                 |
| ------------ | ------------------------------------ |
| Frontend     | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| Map          | Kakao Map JS SDK                     |
| Backend / DB | Supabase (PostgreSQL, PostGIS, Auth) |
| Deploy       | Vercel                               |
| Data         | Python (공공데이터 전처리)           |
| Dev          | GitHub, 바이브 코딩 도구 (Claude 등) |

## 🚀 시작하기

> 개발 초기 단계로, 아래 내용은 구현 진행에 따라 업데이트됩니다.

### 요구 사항

- Node.js 20 이상 (LTS 권장)
- Python 3.11 이상 (데이터 적재 스크립트용)
- 카카오 개발자 계정: JavaScript 키, REST API 키, 웹 플랫폼에 `http://localhost:3000` 등록, 카카오맵 사용 설정
- Supabase 프로젝트 (PostGIS 사용)

### 설치 및 실행

```bash
git clone https://github.com/jeongsemin/taxi-pitstopmap.git
cd taxi-pitstopmap
npm install
cp .env.example .env.local   # 환경변수 입력
npm run dev
```

### 환경변수

```
NEXT_PUBLIC_KAKAO_MAP_KEY=          # 카카오 JavaScript 키
KAKAO_REST_API_KEY=                 # 카카오 REST API 키 (서버 전용)
NEXT_PUBLIC_SUPABASE_URL=           # https://<프로젝트ID>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # publishable(anon) 키
SUPABASE_DB_PASSWORD=               # 데이터 적재 스크립트 전용
SUPABASE_DB_HOST=                   # IPv4 환경에서 Session pooler 호스트 (선택)
```

> ⚠️ `.env` 파일은 절대 커밋하지 말것. `SUPABASE_DB_PASSWORD`에는 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.

### 데이터 준비

앱은 Supabase DB에 적재된 화장실·주차장 데이터를 사용합니다. 프로젝트 루트에서 실행합니다.

```bash
pip install -r data/requirements.txt
python data/scripts/apply_migrations.py        # 테이블·함수 생성
python data/scripts/load_osm_toilets.py        # OSM 화장실 (강남구)
python data/scripts/load_public_toilets.py     # 공공데이터 화장실 (CSV 필요)
python data/scripts/load_parking_lots.py       # 카카오 주차장 (강남구)
```

- 공공 화장실 CSV는 [localdata.go.kr](https://file.localdata.go.kr/file/public_restroom_info/info)에서 지역별로 내려받아 `data/raw/gangnam_restroom.csv`로 저장합니다. (`data/raw/`는 커밋되지 않습니다)
- 원천 데이터에 좌표가 없어 카카오 주소 검색으로 지오코딩합니다.
- Supabase 직접 접속은 IPv6 전용이라 IPv4 환경에서는 `SUPABASE_DB_HOST`에 Session pooler 호스트를 지정합니다.

## 🗺 로드맵

| 단계 | 내용                              | 상태       |
| ---- | --------------------------------- | ---------- |
| 0    | 저장소·프로젝트 세팅, 데이터 조사 | ✅ 완료    |
| 1    | 지도 표시 + 주변 식당 검색        | ✅ 완료    |
| 2    | 공중화장실 데이터 적재            | ✅ 완료    |
| 3    | 주정차 점수 로직                  | ✅ 완료    |
| 4    | 사용자 제보 기능                  | ⬜         |
| 5    | PWA 설정 및 배포                  | ⬜         |
| 6    | 실사용 테스트 (택시 기사 3~5명)   | ⬜         |

초기 대상 지역은 **한 개 구 단위**로 한정해 데이터 품질과 테스트를 관리합니다.

## 📂 문서

- [설계서](Docs/Design.md)

## 🌿 브랜치 및 커밋 규칙

- 브랜치: `main`(배포) / `dev`(개발) / `feature/*`
- 커밋: `feat:` `fix:` `docs:` `chore:`

## 📝 개발 기록

- **공중화장실 좌표 제거**: 공공데이터 원천에서 2025년 2월부터 위·경도가 빠져 카카오 주소 검색으로 지오코딩했습니다. 390건 중 381건(98%)이 변환되었습니다.
- **Supabase IPv6**: 직접 접속 주소가 IPv6 전용이라 IPv4 환경에서는 Session pooler 호스트로 접속합니다.
- **카카오 45건 한도**: 카테고리 검색은 한 번에 최대 45건이라 주차장은 영역을 타일로 나눠 조회하고, 한도에 걸리면 4등분해 재조회합니다.
- **데이터 중복**: 공식 화장실과 30m 이내로 겹치는 OSM 항목은 공식 데이터를 남기고 제거합니다.
- **길찾기 링크**: 카카오맵은 웹 링크라 어디서나 열리고, T맵은 앱 URL 스킴이라 앱이 설치된 휴대폰에서만 동작합니다. 카카오내비 딥링크는 앱 키 등 요구사항을 확인하지 못해 넣지 않았습니다.
- **마이그레이션 이력**: 함수 반환 타입을 바꾸는 변경이 생겨 `schema_migrations` 테이블로 적용 이력을 기록합니다.
- 다음 할 일: 사용자 제보(4단계), 공식 주정차 구간 데이터, PWA·배포

## 📄 라이선스

Copyright © 2026 jungsemin. All Rights Reserved.
본 저장소의 코드는 저작권자의 허락 없이 복제, 수정, 배포, 상업적 이용을 할 수 없습니다.

## 🙏 데이터 출처

- 카카오 로컬 API / 카카오맵 (식당, 주차장, 주소 검색)
- 공공데이터포털·행정안전부 공중화장실정보 (localdata.go.kr)
- © OpenStreetMap contributors

각 데이터의 이용약관을 준수합니다.
