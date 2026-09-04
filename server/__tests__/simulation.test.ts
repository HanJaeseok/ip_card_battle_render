import { initGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { randomEligibleSkill, eligibleAnimals } from '../engine/skills';
import { PLACES, MAX_TURN, DEFAULT_TARGET_SCORE, LOSE_HP } from 'shared';
import type { GameState, Animal, Team } from 'shared';

// ─── 시드 가능한 선형 합동 RNG ────────────────────────────────────────────────
function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// 이 시뮬레이션은 initGame을 기본 설정으로 돌리므로 승리 체력도 기본 목표 점수에서 유도한다
// — shared의 WIN_HP 상수는 "targetScore=10일 때의 참고값"이라 기본값을 바꾸면 어긋난다.
const WIN_HP = DEFAULT_TARGET_SCORE * 2;

type SkillPicker = (state: GameState, team: Team, rng: () => number) => Animal | null;

// 완전 무작위 봇 — 조율 없는 바닥값(baseline).
const randomBot: SkillPicker = (state, team, rng) => randomEligibleSkill(state, team, rng);

// 디자인어(인어)를 계속 쌓다가, 더 쌓을 수 없으면 특허랑이 > 상표토끼 > 실용신양 순으로
// 한 번에 터뜨리는 콤보 봇 — 인어 눈덩이가 실제로 얼마나 강한지 측정하는 용도.
const mermaidComboBot: SkillPicker = (state, team) => {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  if (options.includes('mermaid')) return 'mermaid';
  const priority: Animal[] = ['tiger', 'rabbit', 'sheep'];
  for (const p of priority) if (options.includes(p)) return p;
  return options[0];
};

interface GameResult {
  winner: 'A' | 'B' | 'draw';
  finalTurn: number;
  reason: 'knockout' | 'turnLimit' | null;
  hp: { A: number; B: number };
}

/** 단일 게임 실행 후 결과 반환 — 팀별로 다른 행동 선택 전략(picker)을 쓸 수 있다. */
function runGame(seed: number, pickA: SkillPicker, pickB: SkillPicker): GameResult {
  const rng = makeLCG(seed);
  const state = initGame(['botA'], ['botB'], rng);
  let lastReason: 'knockout' | 'turnLimit' | null = null;

  let safetyCount = 0;
  while (state.phase === 'playing') {
    if (safetyCount++ > 100_000) {
      throw new Error(`시뮬레이션 무한루프 감지 (seed=${seed})`);
    }

    // 장소는 항상 뽑을 수 있으므로(무한 뽑기) 무작위로 1곳 선택
    const place = PLACES[Math.floor(rng() * PLACES.length)];
    processPlayerAction(state, place, rng);

    // 뽑기+정산이 끝나면 행동 하나를 골라야 턴이 넘어간다.
    if (state.pendingChoice !== null) {
      const team = state.pendingChoice;
      const pick = team === 'A' ? pickA : pickB;
      const animal = pick(state, team, rng);
      const { events } = animal === null ? processPass(state) : processSkillChoice(state, animal);
      const endEv = events.find(e => e.type === 'gameEnd');
      if (endEv && endEv.type === 'gameEnd') lastReason = endEv.reason;
    }
  }

  return {
    winner: state.winner ?? 'draw',
    finalTurn: state.turn,
    reason: lastReason,
    hp: { A: state.teams.A.hp, B: state.teams.B.hp },
  };
}

// ─── 시뮬레이션 테스트 (무작위 vs 무작위) ────────────────────────────────────────
describe('봇 대전 시뮬레이션 (500게임, 무작위 vs 무작위)', () => {
  const GAME_COUNT = 500;
  const results: GameResult[] = [];

  beforeAll(() => {
    for (let seed = 1; seed <= GAME_COUNT; seed++) {
      results.push(runGame(seed, randomBot, randomBot));
    }

    const avgTurn = results.reduce((s, r) => s + r.finalTurn, 0) / GAME_COUNT;
    const knockoutRate = results.filter(r => r.reason === 'knockout').length / GAME_COUNT;
    const drawRate = results.filter(r => r.winner === 'draw').length / GAME_COUNT;
    // eslint-disable-next-line no-console
    console.log(
      `[시뮬레이션 요약] 평균 종료 턴=${avgTurn.toFixed(1)}, 녹아웃 비율=${(knockoutRate * 100).toFixed(1)}%, ` +
        `무승부 비율=${(drawRate * 100).toFixed(1)}%`,
    );
  }, 60_000);

  it('크래시·무한루프 없이 전 게임 완주', () => {
    expect(results).toHaveLength(GAME_COUNT);
  });

  it('모든 게임이 종료 상태', () => {
    expect(results.every(r => r.winner !== undefined)).toBe(true);
  });

  it('모든 게임의 종료 상태가 합법적이다 (녹아웃 조건 또는 턴 초과 중 하나이고, 승자가 그와 일치)', () => {
    for (const r of results) {
      if (r.reason === 'knockout') {
        const aWon = r.hp.A >= WIN_HP || r.hp.B <= LOSE_HP;
        const bWon = r.hp.B >= WIN_HP || r.hp.A <= LOSE_HP;
        expect(aWon || bWon).toBe(true);
        expect(r.winner).toBe(aWon ? 'A' : 'B');
      } else {
        expect(r.finalTurn).toBeGreaterThan(MAX_TURN);
        const expected = r.hp.A > r.hp.B ? 'A' : r.hp.B > r.hp.A ? 'B' : 'draw';
        expect(r.winner).toBe(expected);
      }
    }
  });

  it('평균 종료 턴이 합리적인 범위 안에 있다 (즉시 끝나지도, 항상 턴 초과로만 끝나지도 않는다)', () => {
    const avgTurn = results.reduce((s, r) => s + r.finalTurn, 0) / GAME_COUNT;
    expect(avgTurn).toBeGreaterThanOrEqual(3);
    expect(avgTurn).toBeLessThanOrEqual(MAX_TURN + 1);
  });

  it('녹아웃(즉시 승부)으로 끝나는 게임이 절반 이상이다', () => {
    const knockoutRate = results.filter(r => r.reason === 'knockout').length / GAME_COUNT;
    expect(knockoutRate).toBeGreaterThanOrEqual(0.5);
  });

  it('무승부 비율이 30% 미만이다', () => {
    const drawRate = results.filter(r => r.winner === 'draw').length / GAME_COUNT;
    expect(drawRate).toBeLessThan(0.3);
  });

  it('어느 한 팀이 90% 이상 독점하지 않음 (극단적 밸런스 붕괴 없음)', () => {
    const aWins = results.filter(r => r.winner === 'A').length;
    const bWins = results.filter(r => r.winner === 'B').length;
    expect(aWins / GAME_COUNT).toBeLessThan(0.90);
    expect(bWins / GAME_COUNT).toBeLessThan(0.90);
  });
});

// ─── 인어 눈덩이 위험도 측정 (콤보 봇 vs 무작위 봇) ────────────────────────────────
describe('디자인어(인어) 배율 눈덩이 위험도', () => {
  const GAME_COUNT = 300;
  const results: GameResult[] = [];

  beforeAll(() => {
    for (let seed = 1; seed <= GAME_COUNT; seed++) {
      results.push(runGame(seed, mermaidComboBot, randomBot));
    }
    const winRate = results.filter(r => r.winner === 'A').length / GAME_COUNT;
    // eslint-disable-next-line no-console
    console.log(`[인어 콤보 봇] 무작위 상대 대비 승률=${(winRate * 100).toFixed(1)}%`);
  }, 60_000);

  it('인어를 쌓다 몰아치는 콤보 봇이 무작위 봇을 상대로 압도적이지 않다 (85% 미만) — 넘으면 8단계 튜닝 손잡이를 당긴다', () => {
    const comboWins = results.filter(r => r.winner === 'A').length;
    const winRate = comboWins / GAME_COUNT;
    expect(winRate).toBeLessThan(0.85);
  });
});
