# ADR 004 — Figma IA 기반 Harness 구성 계획

**날짜**: 2026-07-03  
**상태**: 계획 확정

---

## 앱 개요

**앱명**: 운동명인  
**사용자 타입**: 명인(전문가) / 고객 (단일 계정에서 모드 전환)

---

## IA 분석 결과

### 공통

| 화면 | 주요 기능 |
|------|----------|
| 온보딩 | 최초 진입, 서비스 안내 |
| 로그인 | 아이디/비밀번호, 카카오/애플 로그인, 이메일저장, 비밀번호찾기 |
| 회원가입 | 일반/카카오/애플 → 모드선택 → 자격증 첨부(전문가) → 검수 |
| 설정 | 개인정보수정(소셜 로그인은 수정불가), 오픈채팅 문구, 로그아웃, 회원탈퇴 |

### 명인(전문가) IA

| 메뉴 | 기능 |
|------|------|
| 홈 | 모드전환(토글), 리뷰요청링크, 광고신청(후순위), 내스케줄(편집/체크박스), 명인등급(리뷰수/별점/등급), 요청진단(최대 3개 미리보기), 내캘린더(후순위) |
| 진단요청 | 고객 프로필 목록(신청순), 삭제(팝업확인), 고객 지역/성별/이름/나이/운동종목/고객코드 표시 |
| 채팅 | 채팅전체/상담전/상담중/완료, 리뷰요청, 채팅삭제 |
| 마이페이지 | 프로필사진, 마이페이지링크(복사/외부SNS 연동), 명인등급, 소개수정, 명인정보(지역필수/센터명+대표서비스필수/키워드태그/이미지최대5장/포트폴리오), 전문가인증(학력PDF/경력텍스트/자격증이미지), 미리보기, 명인인증서(후순위) |
| 팝업 | 리뷰통계 알림(주간 1회, 앱 첫 오픈 시) |

### 고객 IA

| 메뉴 | 기능 |
|------|------|
| 홈 | 모드전환(토글), 이달의소개명인(리뷰/별점 높은순 5명, 자세히보기→명인탭), 내스케줄(후순위), 내캘린더(후순위) |
| AI 명인추천 | Q1 나이/성별/지역 → Q2 주 운동종목 → Q3 불편한 부위 → Q4 일주일간 운동횟수 → AI 한줄정의 → 추천 상위명인 3인 프로필(X눌러 채팅종료) |
| 명인탐색 | 검색(이름/자격증/센터명/지역), 라이징명인(MVP: 리뷰 20개↑), 상세프로필(외부사이트이동/진단요청/관심명인등록) |
| 진단요청 | 명인 오픈카톡 링크 팝업 (카톡이동 버튼 + 개인코드 복사) |
| 마이페이지 | 계정설정(사진/개인코드(고정)/활동명/연령/참여스포츠/증상/지역(필수)/키워드(최대5개)), 관심명인(별표 제거), 리뷰관리(히스토리/수정하기) |

---

## 도메인 엔티티 분석

### 핵심 비즈니스 규칙

- **진단요청**: 앱 내 채팅 없음 → 카카오 오픈채팅 URL로 연동
- **개인코드**: 회원가입 시 부여, 영구 고정
- **모드전환**: 단일 User 테이블, mode 필드 또는 ExpertProfile 존재 여부로 판단
- **자격증 검수**: 첨부 후 관리자 승인 필요 (status 관리)
- **리뷰**: 명인이 카카오 링크 전송 → 고객이 앱에서 별점 입력

### 예상 엔티티 목록

| 엔티티 | 설명 |
|--------|------|
| User | 계정 (명인/고객 공통), personalCode 고정 |
| ExpertProfile | 명인 프로필 (1:1 User) |
| ExpertCertification | 전문가 인증서류 (학력/경력/자격증) |
| ExpertGrade | 명인 등급 (리뷰수/별점/등급) |
| CustomerProfile | 고객 프로필 (1:1 User) |
| DiagnosisRequest | 진단요청 (고객→명인, 카카오 연동) |
| FavoriteExpert | 관심명인 (고객이 별표 저장) |
| Review | 리뷰 (별점, 카카오 링크 토큰 기반) |
| ReviewRequest | 리뷰 요청 토큰 (명인이 발급) |
| Schedule | 내 스케줄 (명인/고객 공통) |
| AiRecommendation | AI 명인추천 히스토리 |
| Notification | 알림 |

---

## Harness 계획

### 목표

명인+고객 IA를 입력으로 받아 자동 생성:
1. **ERD** — 테이블/관계 설계 (마크다운)
2. **API 목록** — 화면별 엔드포인트 (마크다운)
3. **DTO 코드** — NestJS DTO 파일 (TypeScript)

### Harness 구조 (Claude Code Workflow)

```
[입력]
  IA 데이터 (명인 + 고객 통합)
        ↓
[Node 1] IA Analyzer
  입력: IA raw text (명인 + 고객)
  처리: 도메인 엔티티 추출, 관계 정의, 비즈니스 규칙 정리
  출력: { entities[], relations[], businessRules[] }
  확신조건: 모든 화면의 데이터 요소 커버
        ↓
[Node 2] ERD Designer
  입력: Node1 출력
  처리: PostgreSQL 테이블 설계, TypeORM Entity 코드 생성
  출력: ERD 마크다운 + *.entity.ts 코드
  확신조건: 모든 관계(1:1, 1:N, M:N) 정의 완료
        ↓
[Node 3] API Designer
  입력: Node1 출력 + IA 화면 목록
  처리: 화면별 필요 엔드포인트 도출, RESTful 설계
  출력: { apis: [{method, path, summary, requestBody?, responseBody?}] }
  확신조건: 모든 화면의 CRUD 커버
        ↓
[Node 4] DTO Generator
  입력: Node3 API 목록
  처리: Request/Response DTO 생성 (@ApiProperty, class-validator 포함)
  출력: *.dto.ts 파일 코드들
  확신조건: 모든 API req/res DTO 생성 완료
        ↓
[출력]
  sports-master-docs/data-flow/erd.md
  sports-master-docs/data-flow/api-list.md
  sports-master-api/src/modules/**/dto/*.ts
```

### Node 하네스 정의 (입출력 명세)

| Node | 입력 타입 | 출력 타입 | 확신 조건 |
|------|-----------|-----------|----------|
| IA Analyzer | string (IA 원문) | EntitySchema[] | 모든 화면 엔티티 추출 |
| ERD Designer | EntitySchema[] | ErdOutput { markdown, entities: EntityCode[] } | FK/PK/인덱스 모두 정의 |
| API Designer | EntitySchema[] + ScreenList[] | ApiSpec[] | 모든 화면 CRUD 커버 |
| DTO Generator | ApiSpec[] | DtoFile[] | 모든 API req/res DTO 생성 |

---

## 다음 단계

1. [x] 명인 IA 수집 (Figma + Notion)
2. [x] 고객 IA 수집 (Notion)
3. [ ] Claude Code Workflow 스크립트 작성 (`sports-master-docs/harness/ia-to-dto.workflow.js`)
4. [ ] 노드별 JSON Schema 정의 (structured output)
5. [ ] Workflow 실행 → ERD/API/DTO 결과물 검증
6. [ ] 결과물 기반 NestJS 모듈 생성 시작
