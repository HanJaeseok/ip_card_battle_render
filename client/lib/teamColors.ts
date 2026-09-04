import type { CSSProperties } from 'react';
import type { Team } from 'shared';

/**
 * ─── 관전자 시점 팀 색 ────────────────────────────────────────────────────────
 *
 * 실제로 뛰는 사람에게는 "우리 팀 = 연두, 상대 팀 = 붉은색"이라는 기준이 있지만,
 * 관전자에게는 그 기준이 없다(어느 쪽도 우리 팀이 아니다). 그래서 관전 화면에서는
 * 두 팀을 서로 확실히 구분되는 중립색 한 쌍으로 칠한다 — 기본값은 팀 1 민트,
 * 팀 2 핑크다.
 *
 * **색을 바꾸고 싶으면 이 파일의 팔레트만 고치면 된다.** 화면 각 부분(팀 패널·체력
 * 구슬·보드 테두리·손가락 가이드·자막)은 색을 직접 적지 않고, 아래 spectatorTeamVars가
 * 심어주는 CSS 변수(--spec-*)만 읽는다(globals.css의 "관전자 시점" 절 참고).
 */
export interface SpectatorTeamPalette {
  /** 사람이 읽는 색 이름 — 대기실 안내 문구 등에 쓴다. */
  label: string;
  /** 대표색 — 체력 구슬 액체 윗부분, 보드 테두리, 손가락 가이드 글로우. */
  base: string;
  /** 대표색보다 진한 쪽 — 테두리·강조선·자막 글자. */
  strong: string;
  /** 가장 진한 쪽 — 큰 숫자처럼 흰 배경 위에서 또렷해야 하는 글자. */
  deep: string;
  /** 팀 패널 배경 그라데이션 시작(옅음). */
  soft: string;
  /** 팀 패널 배경 그라데이션 끝(조금 더 진함). */
  softEdge: string;
  /** 패널 테두리처럼 배경과 구분만 되면 되는 중간색. */
  border: string;
  /** 빛 번짐용 반투명색 — base와 같은 색의 rgba여야 자연스럽다. */
  glow: string;
}

// soft/softEdge는 실제 플레이어 화면의 팀 배경(bg-lime-100 / bg-rose-100)과 같은 100~200
// 단계로 맞춰 둔다 — 50 단계(#f0fdfa 등)는 흰색과 구분이 안 돼 "색이 안 칠해진 것 같다"는
// 인상을 준다.
export const SPECTATOR_TEAM_PALETTE: Record<Team, SpectatorTeamPalette> = {
  // 팀 1(왼쪽) — 민트
  A: {
    label: '민트',
    base: '#2dd4bf',
    strong: '#0d9488',
    deep: '#134e4a',
    soft: '#ccfbf1',
    softEdge: '#99f6e4',
    border: '#2dd4bf',
    glow: 'rgba(45, 212, 191, 0.65)',
  },
  // 팀 2(오른쪽) — 핑크
  B: {
    label: '핑크',
    base: '#f472b6',
    strong: '#db2777',
    deep: '#831843',
    soft: '#fce7f3',
    softEdge: '#fbcfe8',
    border: '#f472b6',
    glow: 'rgba(244, 114, 182, 0.65)',
  },
};

/**
 * 팔레트를 CSS 변수로 풀어 놓는다 — 이 스타일을 붙인 요소와 그 자손은
 * globals.css의 관전자 전용 클래스(.spectator-*, .hp-orb-spectator 등)를 그대로 쓸 수 있다.
 */
export function spectatorTeamVars(team: Team): CSSProperties {
  const p = SPECTATOR_TEAM_PALETTE[team];
  return {
    '--spec-base': p.base,
    '--spec-strong': p.strong,
    '--spec-deep': p.deep,
    '--spec-soft': p.soft,
    '--spec-soft-edge': p.softEdge,
    '--spec-border': p.border,
    '--spec-glow': p.glow,
  } as CSSProperties;
}
