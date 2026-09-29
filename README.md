# 🚕 taxi-pitstopmap

> 택시 기사를 위한 **주정차 가능 식당·화장실** 안내 서비스

![status](https://img.shields.io/badge/status-planning-yellow)
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

- [ ] 현재 위치 기반 지도 표시
- [ ] 주변 식당·화장실 검색 (반경 조절)
- [ ] 장소별 주정차 점수 표시 (🟢 가능 / 🟡 불확실 / 🔴 어려움)
- [ ] 장소 상세 정보 및 길찾기 연결
- [ ] 식당 / 화장실 / 주차 가능 필터

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

**점수 계산 예시**: 자체 주차장(+40) + 100m 내 공영주차장(+30) + 최근 30일 내 "가능" 제보(+30) − "단속됨" 제보(−40)

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
| Frontend     | Next.js, TypeScript, Tailwind CSS    |
| Map          | Kakao Map JS SDK                     |
| Backend / DB | Supabase (PostgreSQL, PostGIS, Auth) |
| Deploy       | Vercel                               |
| Data         | Python (공공데이터 전처리)           |
| Dev          | GitHub, 바이브 코딩 도구 (Claude 등) |

## 🚀 시작하기

> 개발 초기 단계로, 아래 내용은 구현 진행에 따라 업데이트됩니다.

### 요구 사항

- Node.js 18 이상
- 카카오 개발자 계정 및 JavaScript 키
- Supabase 프로젝트

### 설치 및 실행

```bash
git clone https://github.com/<내아이디>/taxi-pitstopmap.git
cd taxi-pitstopmap
npm install
cp .env.example .env.local   # 환경변수 입력
npm run dev
```

### 환경변수

```
NEXT_PUBLIC_KAKAO_MAP_KEY=
KAKAO_REST_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

> ⚠️ `.env` 파일은 절대 커밋하지 말것.

## 🗺 로드맵

| 단계 | 내용                              | 상태       |
| ---- | --------------------------------- | ---------- |
| 0    | 저장소·프로젝트 세팅, 데이터 조사 | 🔄 진행 중 |
| 1    | 지도 표시 + 주변 식당 검색        | ⬜         |
| 2    | 공중화장실 데이터 적재            | ⬜         |
| 3    | 주정차 점수 로직                  | ⬜         |
| 4    | 사용자 제보 기능                  | ⬜         |
| 5    | PWA 설정 및 배포                  | ⬜         |
| 6    | 실사용 테스트 (택시 기사 3~5명)   | ⬜         |

초기 대상 지역은 **한 개 구 단위**로 한정해 데이터 품질과 테스트를 관리합니다.

## 📂 문서

- [설계서](Docs/design.md)

## 🌿 브랜치 및 커밋 규칙

- 브랜치: `main`(배포) / `dev`(개발) / `feature/*`
- 커밋: `feat:` `fix:` `docs:` `chore:`

## 📝 개발 기록

<!-- 트러블슈팅, 의사결정 기록, 배운 점을 여기에 정리하거나 docs/ 에 링크하세요 -->

## 📄 라이선스

Copyright © 2026 <내이름>. All Rights Reserved.
본 저장소의 코드는 저작권자의 허락 없이 복제, 수정, 배포, 상업적 이용을 할 수 없습니다.

## 🙏 데이터 출처

- 카카오 로컬 API / 카카오맵
- 공공데이터포털
- © OpenStreetMap contributors

각 데이터의 이용약관을 준수합니다.

```

```

## 붙여넣은 뒤 수정할 부분

- `<내아이디>`: GitHub 아이디
- `<내이름>`: 라이선스 문구의 저작권자 이름

이미 받아 두신 `README.md` 파일이 있다면 그대로 쓰셔도 내용은 동일합니다. 커밋 명령어는 이전 안내와 같아요.

```bash
cd D:\portfolio\taxi-pitstopmap
git add README.md
git commit -m "docs: add README draft"
git push
```
