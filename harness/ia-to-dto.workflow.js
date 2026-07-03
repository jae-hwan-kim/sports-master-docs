export const meta = {
  name: 'ia-to-dto',
  description: '운동명인 IA → ERD + API 목록 + NestJS DTO 자동 생성',
  phases: [
    { title: 'IA 분석', detail: 'IA에서 도메인 엔티티/관계/비즈니스 규칙 추출' },
    { title: 'ERD 설계', detail: 'TypeORM Entity 코드 + ERD 마크다운 생성' },
    { title: 'API 설계', detail: '화면별 RESTful 엔드포인트 도출' },
    { title: 'DTO 생성', detail: 'NestJS DTO 코드 파일 생성' },
  ],
}

// ─── 입력 데이터 ───────────────────────────────────────────────────────────────

const IA_DATA = `
## 앱명: 운동명인
## 사용자 타입: 명인(전문가) / 고객 (단일 계정, 모드 전환)

### 비즈니스 핵심 규칙
- 진단요청: 앱 내 채팅 없음 → 명인의 카카오 오픈채팅 URL로 연동
- 개인코드(personalCode): 회원가입 시 부여, 영구 고정, 수정불가
- 모드전환: 단일 User가 명인/고객 모드 전환 가능
- 자격증 검수: 이미지/PDF 첨부 후 관리자 승인 필요 (pending/approved/rejected)
- 리뷰: 명인이 카카오 링크 전송 → 고객이 앱 내 팝업에서 별점 입력
- 명인 등급: 리뷰수 + 별점 기반 등급 부여
- iOS 배포 시 애플 로그인 필수

### 명인(전문가) 기능
온보딩/로그인:
- 아이디/비밀번호, 카카오/애플 OAuth
- 회원가입: 일반/소셜 → 모드선택 → 자격증 첨부(물리치료사/건강운동관리사) → 검수
설정:
- 개인정보(전화번호/이메일/PW), 소셜로그인은 수정불가 팝업
- 오픈채팅 문구 제공, 로그아웃, 회원탈퇴
홈:
- 모드전환 토글
- 리뷰요청 링크
- 광고신청(후순위, 기간선택/1회성 청구)
- 내스케줄(편집/체크박스/삭제)
- 명인등급(리뷰수/별점/등급, 터치→마이페이지)
- 요청진단 미리보기(최대 3개, 신청순, 터치→진단요청 메뉴)
- 내캘린더(후순위)
진단요청:
- 고객 프로필 목록(신청순)
- 고객 정보: 지역/성별/이름/나이/주운동종목/고객코드
- 삭제하기(팝업 확인)
채팅:
- 채팅전체/상담전/상담중/완료 탭
- 리뷰요청(링크 전송), 채팅삭제
마이페이지:
- 프로필사진(앨범)
- 마이페이지 링크(복사, 인스타/네이버 등 외부 SNS 연동)
- 명인등급(리뷰수/별점/등급/인증마크)
- 소개 수정/미리보기
- 명인정보: 지역(필수), 센터명/대표서비스(필수), 키워드태그, 이미지(최대5장), 포트폴리오
- 전문가인증: 학력(PDF), 경력텍스트, 자격증/졸업증명서(이미지)
- 미리보기 (고객에게 보이는 프로필)
- 결제방식(현재 버전 제외)
- 명인인증서(후순위, PDF)
팝업:
- 리뷰통계 알림창(주간 집계, 앱 첫 오픈 시 1회)

### 고객 기능
홈:
- 모드전환 토글
- 이달의소개명인(리뷰/별점 높은순 5명, 자세히보기→명인탐색)
  - 사이트방문/인스타방문(외부앱 연동)
  - 진단요청, 관심명인 등록
- 내스케줄(후순위, 명인방문 스케줄)
- 내캘린더(후순위)
AI 명인추천(FAE):
- Q1: 나이/성별/지역
- Q2: 주 운동종목
- Q3: 불편한 부위
- Q4: 일주일간 운동횟수
- 모든 항목 응답 시 AI 한줄정의 + 추천 상위명인 3인 프로필
- 프로필 터치→명인 상세, X눌러 종료
명인탐색:
- 검색(이름/자격증/센터명, 지역설정)
- 라이징명인(MVP: 리뷰 20개↑)
- 상세프로필: 명인 작성 내용 전체, 외부사이트 이동
  - 진단요청: 명인 오픈카톡 링크 팝업(카톡이동 + 개인코드 복사)
  - 관심명인 등록(별표)
마이페이지:
- 계정설정: 사진(앨범), 개인코드(고정/수정불가), 활동명, 연령, 참여스포츠, 증상, 지역(필수), 키워드(최대5개, 명인 태그 종류와 동일)
- 관심명인: 명인 프로필 목록, 채팅하기, 별표해제→관심명인 제거
- 리뷰관리: 히스토리, 수정하기(카카오 링크 클릭→앱 이동→팝업 별점 입력)
`

// ─── Schema 정의 ───────────────────────────────────────────────────────────────

const ENTITY_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                nullable: { type: 'boolean' },
                unique: { type: 'boolean' },
                description: { type: 'string' },
              },
              required: ['name', 'type'],
            },
          },
          relations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['OneToOne', 'OneToMany', 'ManyToOne', 'ManyToMany'] },
                target: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['type', 'target'],
            },
          },
        },
        required: ['name', 'fields'],
      },
    },
    businessRules: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['entities', 'businessRules'],
}

const ERD_SCHEMA = {
  type: 'object',
  properties: {
    erdMarkdown: { type: 'string', description: 'Mermaid ERD 다이어그램 포함한 전체 마크다운' },
    entityCodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '예: user.entity.ts' },
          modulePath: { type: 'string', description: '예: modules/user' },
          code: { type: 'string' },
        },
        required: ['filename', 'modulePath', 'code'],
      },
    },
  },
  required: ['erdMarkdown', 'entityCodes'],
}

const API_SCHEMA = {
  type: 'object',
  properties: {
    apis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string', description: '모듈/도메인 이름 (예: auth, expert-profile)' },
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          path: { type: 'string', description: '예: /expert-profiles/:id' },
          summary: { type: 'string' },
          requestBody: { type: 'string', description: '요청 바디 필드 설명 (없으면 null)' },
          responseBody: { type: 'string', description: '응답 바디 설명' },
          auth: { type: 'boolean', description: 'JWT 인증 필요 여부' },
        },
        required: ['tag', 'method', 'path', 'summary', 'auth'],
      },
    },
    apiMarkdown: { type: 'string', description: '전체 API 목록 마크다운' },
  },
  required: ['apis', 'apiMarkdown'],
}

const DTO_SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '예: create-user.dto.ts' },
          modulePath: { type: 'string', description: '예: modules/user/dto' },
          code: { type: 'string' },
        },
        required: ['filename', 'modulePath', 'code'],
      },
    },
  },
  required: ['files'],
}

// ─── Workflow 실행 ─────────────────────────────────────────────────────────────

phase('IA 분석')
log('명인 + 고객 IA에서 도메인 엔티티 추출 중...')

const entityResult = await agent(
  `다음은 "운동명인" 모바일 앱의 IA(Information Architecture)입니다.

${IA_DATA}

위 IA를 분석하여 NestJS + TypeORM + PostgreSQL 기반 백엔드에 필요한:
1. 도메인 엔티티 목록 (필드, 타입, nullable 여부 포함)
2. 엔티티 간 관계 (OneToOne/OneToMany/ManyToOne/ManyToMany)
3. 핵심 비즈니스 규칙

을 추출하세요.

주의사항:
- User 단일 테이블로 명인/고객 통합 (currentMode 필드로 전환)
- ExpertProfile, CustomerProfile은 User와 1:1 관계
- personalCode는 User 생성 시 자동 부여, unique, 수정불가
- 진단요청은 카카오 오픈채팅 URL 연동이므로 앱 내 채팅 메시지 저장 없음
- 후순위 기능은 포함하되 optional 필드로 표시
- TypeScript + TypeORM 타입 사용 (string, number, boolean, Date, enum)`,
  { schema: ENTITY_SCHEMA, label: 'IA Analyzer' }
)

phase('ERD 설계')
log('엔티티 → PostgreSQL 테이블 + TypeORM Entity 코드 생성 중...')

const erdResult = await agent(
  `다음 엔티티 분석 결과를 바탕으로 TypeORM Entity 코드와 ERD 마크다운을 생성하세요.

엔티티 목록:
${JSON.stringify(entityResult.entities, null, 2)}

비즈니스 규칙:
${entityResult.businessRules.join('\n')}

요구사항:
1. **ERD 마크다운**: Mermaid erDiagram 포함, 관계선 표기 (||--o{, |{--|| 등), 모든 필드 표시
2. **TypeORM Entity 코드**:
   - @Entity(), @PrimaryGeneratedColumn('uuid') 사용
   - createdAt, updatedAt은 @CreateDateColumn(), @UpdateDateColumn() 사용
   - 관계는 @OneToOne, @OneToMany, @ManyToOne, @ManyToMany + @JoinColumn/@JoinTable
   - enum은 TypeScript enum으로 별도 정의 (파일 상단)
   - @Column() 옵션: nullable, unique, default, length 적절히 설정
   - 파일명: {entity-name}.entity.ts, 경로: modules/{domain}/{entity-name}.entity.ts`,
  { schema: ERD_SCHEMA, label: 'ERD Designer' }
)

phase('API 설계')
log('화면별 RESTful API 엔드포인트 도출 중...')

const apiResult = await agent(
  `다음 IA와 엔티티를 바탕으로 NestJS RESTful API 목록을 설계하세요.

IA 데이터:
${IA_DATA}

엔티티 목록:
${entityResult.entities.map(e => e.name).join(', ')}

요구사항:
1. 모든 화면의 CRUD를 커버하는 엔드포인트 도출
2. RESTful 규칙 준수 (명사형 URL, 복수형, 계층구조)
3. auth: true = JWT Bearer 토큰 필요
4. 태그(tag)는 NestJS 모듈 단위 (예: auth, users, expert-profiles, diagnoses, reviews)
5. 후순위 기능(광고, 캘린더)도 포함하되 summary에 [후순위] 표시
6. apiMarkdown에 태그별 그룹핑된 전체 API 목록 마크다운 작성

특이사항:
- 진단요청: 명인의 openChatUrl을 반환하는 API (실제 채팅은 카카오로)
- 명인 인증 검수: 관리자 전용 API (PATCH /expert-certifications/:id/status)
- 리뷰: POST /reviews (token 기반, 카카오 링크 클릭 후 앱 내 팝업)`,
  { schema: API_SCHEMA, label: 'API Designer' }
)

phase('DTO 생성')
log('NestJS DTO 파일 생성 중...')

const dtoResult = await agent(
  `다음 API 목록을 기반으로 NestJS DTO 파일을 생성하세요.

API 목록:
${JSON.stringify(apiResult.apis, null, 2)}

엔티티 필드 정보:
${JSON.stringify(entityResult.entities, null, 2)}

요구사항:
1. **Request DTO** (요청 바디가 있는 POST/PUT/PATCH):
   - 파일명: create-{domain}.dto.ts 또는 update-{domain}.dto.ts
   - @ApiProperty({ description: '...', example: '...' }) 모든 필드에 필수
   - class-validator 데코레이터: @IsString(), @IsNotEmpty(), @IsOptional(), @IsEnum(), @IsUrl(), @Min(), @Max() 등
   - class-transformer: @Type(() => Number) 등 필요 시

2. **Response DTO** (조회 응답):
   - 파일명: {domain}-response.dto.ts
   - @ApiProperty() 모든 필드에 필수
   - 민감정보 제외 (password 등)

3. **공통 규칙**:
   - import 순서: @nestjs/swagger → class-validator → class-transformer → 내부
   - optional 필드는 @IsOptional() + ? 표시
   - 경로: modules/{domain}/dto/{filename}`,
  { schema: DTO_SCHEMA, label: 'DTO Generator' }
)

// ─── 결과물 정리 ───────────────────────────────────────────────────────────────

log('Harness 완료 — 결과물 정리 중...')

return {
  summary: {
    entityCount: entityResult.entities.length,
    apiCount: apiResult.apis.length,
    dtoFileCount: dtoResult.files.length,
    entityCodeCount: erdResult.entityCodes.length,
  },
  erd: {
    markdown: erdResult.erdMarkdown,
    entities: erdResult.entityCodes,
  },
  api: {
    markdown: apiResult.apiMarkdown,
    specs: apiResult.apis,
  },
  dto: {
    files: dtoResult.files,
  },
}
