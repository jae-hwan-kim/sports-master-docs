# TMS 하드웨어/테스트 인프라 레퍼런스

> CLAUDE.md에서 분리됨. tms-log-analyze가 실패 원인을 진단할 때(예: PCIe 링크 다운, PMU 전원 이상, 테스터 환경 불일치) 참고하는 하드웨어 배경지식.

---

## 하드웨어 계층 구조

```
Rack (D80/FD16/EURO/TH80)
  └── Tester (PC/S2/S8/OAKGATE/SANBLAZE/SERVER)
        └── Slot (1..N)
              ├── NVMe SSD (테스트 대상)
              └── PMU (전원 제어)
```

### TesterType별 특징

| 타입         | 슬롯 수 |
| ------------ | ------- |
| **PC**       | 2       |
| **S2**       | 2       |
| **S8**       | 8       |
| **OAKGATE**  | 16      |
| **SANBLAZE** | 16      |
| **SERVER**   | -       |
