# 운동명인 API 목록

---

## auth

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | /auth/check-nickname | N | 닉네임 사용 가능 확인 |
| GET | /auth/check-email | N | 이메일 중복 확인 |
| POST | /auth/register | N | 일반 회원가입 (이메일/비밀번호) |
| POST | /auth/login | N | 일반 로그인 (이메일/비밀번호) |
| POST | /auth/kakao | N | 카카오 OAuth 로그인/회원가입 |
| GET | /auth/kakao/callback | N | 카카오 리다이렉트 중계 (앱 커스텀 스킴으로 재리다이렉트) |
| POST | /auth/apple | N | 애플 OAuth 로그인/회원가입 (iOS 필수) |
| POST | /auth/google | N | 구글 OAuth 로그인/회원가입 (idToken 검증) |
| POST | /auth/refresh | N | Access Token 재발급 |
| POST | /auth/logout | Y | 로그아웃 (refreshToken 무효화) |
| DELETE | /auth/withdraw | Y | 회원탈퇴 |

> 소셜 로그인 3종은 앱에서 받은 토큰을 서버가 검증하는 방식이다. 카카오만 code를 넘기고(서버가 토큰 교환), 애플/구글은 앱에서 얻은 idToken을 넘긴다.
> 구글 idToken의 `aud`는 플랫폼별로 다르다 — iOS는 iOS 유형 클라이언트 ID(`GOOGLE_CLIENT_ID`), Android는 Web 유형 클라이언트 ID(`GOOGLE_WEB_CLIENT_ID`). 자세한 배경은 [ADR 005](../adr/005-android-google-native-signin.md).

---

## users

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | /users/me | Y | 내 계정 정보 조회 |
| PATCH | /users/me | Y | 계정 기본정보 수정 (전화번호/이메일/비밀번호) |
| PATCH | /users/me/mode | Y | 명인/고객 모드 전환 |

---

## expert-profiles

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /expert-profiles | Y | 명인 프로필 최초 생성 (회원가입 온보딩) |
| GET | /expert-profiles/me | Y | 내 명인 프로필 조회 |
| PATCH | /expert-profiles/me | Y | 명인 프로필 수정 (소개/센터명/지역/키워드태그 등) |
| POST | /expert-profiles/me/images | Y | 명인 소개 이미지 업로드 (최대 5장) |
| DELETE | /expert-profiles/me/images/:imageId | Y | 명인 소개 이미지 삭제 |
| POST | /expert-profiles/me/portfolio | Y | 포트폴리오 추가 |
| DELETE | /expert-profiles/me/portfolio/:portfolioId | Y | 포트폴리오 삭제 |
| PATCH | /expert-profiles/me/education | Y | 학력 정보 수정 (PDF 업로드) |
| PATCH | /expert-profiles/me/career | Y | 경력 텍스트 수정 |
| PATCH | /expert-profiles/me/avatar | Y | 명인 프로필 사진 변경 |
| GET | /expert-profiles/me/preview | Y | 고객에게 보이는 명인 프로필 미리보기 |
| GET | /expert-profiles/me/share-link | Y | 마이페이지 공유 링크 조회 |
| GET | /expert-profiles | N | 명인 탐색 목록 조회 (?q=&region= 검색/필터) |
| GET | /expert-profiles/rising | N | 라이징 명인 목록 (리뷰 20개 이상 MVP) |
| GET | /expert-profiles/featured | N | 이달의 소개 명인 (리뷰/별점 높은순 5명) |
| GET | /expert-profiles/:id | N | 명인 상세 프로필 조회 (공개) |
| GET | /expert-profiles/:id/open-chat-url | Y | 진단요청용 명인 오픈채팅 URL 조회 |

---

## certifications

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /certifications | Y | 자격증/졸업증명서 첨부 및 검수 요청 |
| GET | /certifications/me | Y | 내 자격증 검수 목록 조회 |
| GET | /certifications | Y | [관리자] 전체 자격증 검수 목록 |
| PATCH | /certifications/:id/status | Y | [관리자] 자격증 검수 상태 변경 (approved/rejected) |

---

## customer-profiles

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /customer-profiles | Y | 고객 프로필 최초 생성 |
| GET | /customer-profiles/me | Y | 내 고객 프로필 조회 |
| PATCH | /customer-profiles/me | Y | 고객 프로필 수정 (활동명/연령/스포츠/증상/지역/키워드) |
| PATCH | /customer-profiles/me/avatar | Y | 고객 프로필 사진 변경 |

---

## diagnoses

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /diagnoses | Y | 진단 요청 신청 (고객→명인) |
| GET | /diagnoses/incoming | Y | 명인: 수신된 진단요청 목록 (신청순) |
| GET | /diagnoses/incoming/preview | Y | 명인 홈: 진단요청 미리보기 (최대 3개) |
| DELETE | /diagnoses/:id | Y | 명인: 진단요청 삭제 |

---

## chat-rooms

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | /chat-rooms | Y | 채팅방 목록 조회 (?status=all|pending|active|done) |
| PATCH | /chat-rooms/:id/status | Y | 채팅 상태 변경 (상담전→상담중→완료) |
| DELETE | /chat-rooms/:id | Y | 채팅방 삭제 |
| POST | /chat-rooms/:id/review-request | Y | 명인: 리뷰 요청 링크 전송 (카카오 딥링크 생성) |

---

## reviews

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /reviews | Y | 고객: 리뷰 작성 (카카오 링크 → 앱 팝업 경유) |
| GET | /reviews/me | Y | 고객: 내 리뷰 히스토리 조회 |
| PATCH | /reviews/:id | Y | 고객: 리뷰 수정 |
| GET | /reviews/expert/:expertId | N | 특정 명인 리뷰 목록 조회 |
| GET | /reviews/stats/weekly | Y | 명인: 주간 리뷰 통계 (홈 팝업용) |
| POST | /reviews/request-token | Y | 명인: 리뷰 요청 토큰 생성 (딥링크용) |

---

## favorite-experts

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | /favorite-experts | Y | 고객: 관심명인 목록 조회 |
| POST | /favorite-experts | Y | 고객: 관심명인 등록 (별표) |
| DELETE | /favorite-experts/:expertId | Y | 고객: 관심명인 해제 |

---

## schedules

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| GET | /schedules | Y | 내 스케줄 목록 조회 |
| POST | /schedules | Y | 스케줄 추가 |
| PATCH | /schedules/:id | Y | 스케줄 수정 (내용/체크박스 토글) |
| DELETE | /schedules/:id | Y | 스케줄 삭제 |

---

## ai-recommendations

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /ai-recommendations | N | AI 명인 추천 FAE (Q1~Q4 응답 기반) |

---

## ad-campaigns (후순위)

| Method | Path | Auth | Summary |
|--------|------|------|---------|
| POST | /ad-campaigns | Y | [후순위] 명인: 광고 신청 (기간 선택, 1회성 청구) |
| GET | /ad-campaigns/me | Y | [후순위] 명인: 내 광고 신청 내역 조회 |
| DELETE | /ad-campaigns/:id | Y | [후순위] 명인: 광고 신청 취소 |
