# HOP v0.5.0 Release 1-Pager

## Background

포크(FMsongX2/hop)의 첫 릴리즈. rhwp v0.8.6 통합, HWPX 저장, 암호 문서, 한글식 단축키·메뉴 복원, 라이선스 고지 동봉이 들어간다.

## Problem

원저장소 릴리즈 설정은 Apple 서명·공증 secret과 golbin 업데이터 키·endpoint를 전제한다. 포크에는 그 자격 증명이 없다.

## Goal

- v0.5.0 태그로 macOS arm64/x64, Windows x64, Linux x64/arm64 빌드를 만들어 GitHub Release로 올린다.
- 업데이터가 포크 릴리즈만 보게 한다.

## Non-goals

- Apple 서명·공증, Windows Authenticode 서명.
- 원저장소 site(GitHub Pages) 갱신.

## Constraints

- 버전 소스 7곳을 0.5.0으로 정렬한다(`tests/hop-version.test.mjs`).
- 릴리즈 asset 이름은 유지한다.

## Implementation outline

1. 버전 0.5.0, updater `pubkey`·`endpoints`를 포크 키·저장소로 교체.
2. 워크플로에 `allow_unsigned_macos` 입력을 추가해 Apple secret 검사만 건너뛴다.
3. `TAURI_SIGNING_PRIVATE_KEY` secret 등록 후 `HOP Desktop Release`를 `create_release=true`, `release_tag=v0.5.0`으로 실행.
4. draft 릴리즈 asset·`latest.json`·`SHA256SUMS.txt` 확인 뒤 publish.

## Verification plan

- `pnpm test`, `pnpm run test:upstream`, CI 통과.
- 릴리즈 asset 7종 + updater asset + `latest.json` 존재 확인.

## Rollback or recovery notes

워크플로 실패 시 draft를 publish하지 않고 fix-forward. 태그는 이동하지 않는다.
