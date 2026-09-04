import { initGame, advanceTurn } from '../engine/turnManager';
import { drawCard } from '../engine/drawCard';
import { processPlayerAction, processSkillChoice, processPass, processTimeout } from '../engine/gameEngine';
import { applySkillChoice, applyPass, levelOf } from '../engine/skills';
import type { Animal, CardNum, StackedCard } from 'shared';
import { MAX_TURN, SHEEP_SAFETY_CAP, THRESHOLDS, FESTIVAL_TURN, DEFAULT_TARGET_SCORE } from 'shared';

// 이 테스트들은 initGame을 기본 설정으로 돌리므로 시작·승리 체력을 기본 목표 점수에서
// 유도한다 — shared의 INITIAL_HP/WIN_HP 상수는 "targetScore=10일 때의 참고값"이라
// 기본값을 바꾸면 어긋난다(시작 체력 = targetScore, 승리 체력 = targetScore × 2).
const INITIAL_HP = DEFAULT_TARGET_SCORE;
const WIN_HP = DEFAULT_TARGET_SCORE * 2;

// 결정론적 RNG (항상 0 반환 — Math.floor(rng()*n)은 항상 0번째 원소를 고른다)
const rng0 = () => 0;
// 옵션 2개짜리 장소에서 항상 마지막(1번째) 원소를 고르게 하는 RNG
const rngLast = () => 0.99;

let cardIdSeed = 0;
function stackedCard(animal: Animal, num: CardNum): StackedCard {
  return { id: ++cardIdSeed, animal, num, collectedBy: null };
}

// ─── 홀수 잔류 / 짝수 즉시 수집 (경험치만 오른다 — 체력은 불변) ────────────────────
describe('홀수 잔류', () => {
  it('3장 스택 시 아무것도 수집하지 않음', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.stacks.rabbit.push(stackedCard('rabbit', 7), stackedCard('rabbit', 6));
    // house = [rabbit, sheep] — rng0는 항상 0번째(rabbit)를 뽑는다
    drawCard(state, 'house', rng0);
    // 2장 + 1장 = 3장(홀수) → 수집 없음
    expect(state.teams['A'].exp.rabbit).toBe(0);
    expect(state.stacks.rabbit.every(c => c.collectedBy === null)).toBe(true);
  });

  it('짝수(2장) 스택 시 즉시 수집 — 경험치만 오르고 체력은 그대로다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.stacks.tiger.push(stackedCard('tiger', 6));
    // dock = [mermaid, tiger] — rngLast는 항상 마지막(tiger)을 뽑는다
    drawCard(state, 'dock', rngLast);
    // dock은 2종 장소라 새로 뽑히는 카드 숫자는 5~10 중 rngLast로 고정된 10 → 기존 6 + 새 10 = 16
    expect(state.teams['A'].exp.tiger).toBe(16);
    expect(state.stacks.tiger.every(c => c.collectedBy === 'A')).toBe(true);
    // 규칙 1의 핵심: 카드 숫자 합은 절대 체력(=점수)이 되지 않는다.
    expect(state.teams['A'].hp).toBe(INITIAL_HP);
  });

  it('축제 중이어도 페어 경험치는 배가되지 않는다(카드 숫자 합 그대로)', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.festival = true;
    state.stacks.tiger.push(stackedCard('tiger', 6));
    const events = drawCard(state, 'dock', rngLast); // 6 + 10 = 16, 배가 없음

    expect(state.teams['A'].exp.tiger).toBe(16);
    const collectEv = events.find(e => e.type === 'collect');
    expect(collectEv).toMatchObject({ type: 'collect', animal: 'tiger', exp: 16 });
  });
});

// ─── 레벨 계산 ───────────────────────────────────────────────────────────────
describe('레벨 = floor(경험치 / 임계값)', () => {
  it('양·토끼는 10점 단위, 인어·호랑이는 20점 단위', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.sheep = 25;
    state.teams['A'].exp.rabbit = 9;
    state.teams['A'].exp.mermaid = 41;
    state.teams['A'].exp.tiger = 20;

    expect(levelOf(state, 'A', 'sheep')).toBe(2);
    expect(levelOf(state, 'A', 'rabbit')).toBe(0);
    expect(levelOf(state, 'A', 'mermaid')).toBe(2);
    expect(levelOf(state, 'A', 'tiger')).toBe(1);
  });
});

// ─── 행동 효과 ───────────────────────────────────────────────────────────────
describe('행동 — 실용신양', () => {
  it('레벨만큼(배율 반영) 다음 내 턴에 추가 뽑기를 예약하고, 체력 변화는 없다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.sheep = 35; // level=3

    const ev = applySkillChoice(state, 'A', 'sheep');
    expect(ev.type).toBe('skillApplied');
    if (ev.type === 'skillApplied') {
      expect(ev.extraDrawsQueued).toBe(3);
      expect(ev.myHpDelta).toBe(0);
      expect(ev.oppHpDelta).toBe(0);
    }
    expect(state.teams['A'].pendingExtraDraws).toBe(3);
    expect(state.teams['A'].hp).toBe(INITIAL_HP);
  });
});

describe('행동 — 상표토끼', () => {
  it('내 체력이 레벨×배율만큼 오르고, 사용 통계가 기록된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.rabbit = 20; // level=2, 정확히 배수라 초과분 없음

    const ev = applySkillChoice(state, 'A', 'rabbit');
    expect(ev.type === 'skillApplied' && ev.myHpDelta).toBe(2);
    expect(state.teams['A'].hp).toBe(INITIAL_HP + 2);
    // 사용한 레벨(2×10=20)만 차감된다
    expect(state.teams['A'].exp.rabbit).toBe(0);
    expect(state.teams['A'].skillStats.rabbit).toEqual({ count: 1, totalLevel: 2, totalHpGained: 2, totalExtraDraws: 0 });
  });

  it('임계값을 초과해 쌓아둔 경험치는 사용 후에도 남고, 얻은 체력이 경험치로 새지 않는다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.rabbit = 25; // level=2(20점 사용), 초과분 5점
    state.teams['A'].hp = 5;

    const ev = applySkillChoice(state, 'A', 'rabbit');
    expect(ev.type === 'skillApplied' && ev.myHpDelta).toBe(2);
    expect(state.teams['A'].hp).toBe(7);
    // 25 - (2×10) = 5(초과분)만 남고, 체력으로 간 값은 경험치 쪽에 전혀 섞이지 않는다.
    expect(state.teams['A'].exp.rabbit).toBe(5);
  });

  it('배율이 실려 있으면 그만큼 곱해지고, 사용 후 배율은 1로 초기화된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.rabbit = 10; // level=1
    state.teams['A'].pendingMultiplier = 8;

    const ev = applySkillChoice(state, 'A', 'rabbit');
    expect(ev.type === 'skillApplied' && ev.myHpDelta).toBe(8); // 1 × 8
    expect(ev.type === 'skillApplied' && ev.multiplierUsed).toBe(8);
    expect(state.teams['A'].pendingMultiplier).toBe(1);
  });
});

describe('행동 — 디자인어', () => {
  it('대기 배율에 레벨만큼 더해지고(합연산), 자기 자신은 배율을 소모하지 않는다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.mermaid = 40; // level=2

    const ev1 = applySkillChoice(state, 'A', 'mermaid');
    expect(ev1.type === 'skillApplied' && ev1.multiplierAfter).toBe(3); // 1(기본) + 2(레벨)
    expect(state.teams['A'].pendingMultiplier).toBe(3);
    expect(state.teams['A'].hp).toBe(INITIAL_HP); // 체력 불변

    // 연속으로 다시 쓰면 곱연산이 아니라 합연산으로 레벨이 그대로 누적된다 (3 + 2 = 5)
    state.teams['A'].exp.mermaid = 40;
    const ev2 = applySkillChoice(state, 'A', 'mermaid');
    expect(ev2.type === 'skillApplied' && ev2.multiplierUsed).toBe(1); // 인어는 자기 배율을 쓰지 않는다
    expect(state.teams['A'].pendingMultiplier).toBe(5);
  });

  it.each(['sheep', 'rabbit', 'tiger'] as const)('%s은 배율을 쓰고 나면 1로 초기화된다', animal => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].pendingMultiplier = 8;
    state.teams['A'].exp[animal] = THRESHOLDS[animal]; // level=1
    if (animal === 'tiger') state.teams['B'].hp = 999; // 강탈이 클램프에 걸리지 않도록 넉넉히

    applySkillChoice(state, 'A', animal);
    expect(state.teams['A'].pendingMultiplier).toBe(1);
  });

  it('패스는 배율을 소모하지 않는다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].pendingMultiplier = 8;
    applyPass('A', false);
    expect(state.teams['A'].pendingMultiplier).toBe(8);
  });

  it('배율은 팀별로 독립적이고, 상대 턴을 한 번 거쳐도 유지된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.mermaid = 20; // level=1
    state.pendingChoice = 'A';

    const { state: s1 } = processSkillChoice(state, 'mermaid');
    expect(s1.teams.A.pendingMultiplier).toBe(2);
    expect(s1.activeTeam).toBe('B');

    // B팀 턴 — 아무 행동도 없이(고를 게 없어) 패스
    const { state: s2 } = processPlayerAction(s1, 'house', rng0);
    expect(s2.pendingChoice).toBe('B');
    const { state: s3 } = processPass(s2);

    expect(s3.teams.A.pendingMultiplier).toBe(2); // B의 턴을 거쳐도 그대로
    expect(s3.teams.B.pendingMultiplier).toBe(1); // B는 아예 건드리지 않았다
  });
});

describe('행동 — 레벨 부족', () => {
  it('레벨이 0인 동물을 고르면 경험치·체력·배율 아무것도 바뀌지 않는다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    const ev = applySkillChoice(state, 'A', 'sheep');
    expect(ev.type === 'skillApplied' && ev.level).toBe(0);
    expect(state.teams['A'].exp.sheep).toBe(0);
    expect(state.teams['A'].hp).toBe(INITIAL_HP);
    expect(state.teams['A'].pendingMultiplier).toBe(1);
    expect(state.teams['A'].skillStats.sheep).toEqual({ count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 });
  });
});

describe('행동 — 특허랑이', () => {
  it('상대 체력을 레벨×배율만큼 강탈한다 (상대 −n, 나 +n)', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.tiger = 20; // level=1
    state.teams['B'].hp = 5;

    const ev = applySkillChoice(state, 'A', 'tiger');
    expect(ev.type === 'skillApplied' && ev.oppHpDelta).toBe(-1);
    expect(ev.type === 'skillApplied' && ev.myHpDelta).toBe(1);
    expect(state.teams['B'].hp).toBe(4);
    expect(state.teams['A'].hp).toBe(INITIAL_HP + 1);
  });

  it('강탈량이 상대 체력보다 크면 상대가 가진 만큼만 뺏는다(보존형, 오버킬 없음) — 그 결과 즉시 승리한다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.tiger = 20; // level=1
    state.teams['A'].pendingMultiplier = 4; // amount = 1 × 4 = 4
    state.teams['B'].hp = 3; // 강탈량(4)보다 적게 가지고 있다

    const ev = applySkillChoice(state, 'A', 'tiger');
    expect(ev.type === 'skillApplied' && ev.oppHpDelta).toBe(-3); // 3만큼만
    expect(ev.type === 'skillApplied' && ev.myHpDelta).toBe(3);
    expect(state.teams['B'].hp).toBe(0);
    expect(state.teams['A'].hp).toBe(INITIAL_HP + 3);
  });
});

// ─── 실용신양 예약 뽑기 소모 ───────────────────────────────────────────────────
describe('실용신양 — 예약된 추가 뽑기 소모', () => {
  it('pendingExtraDraws만큼 이번 액션에서 추가로 뽑고 0으로 초기화된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].pendingExtraDraws = 3;

    const events = drawCard(state, 'house', rng0);
    const bonus = events.find(e => e.type === 'bonusDraws');
    expect(bonus && bonus.type === 'bonusDraws' ? bonus.count : 0).toBe(3);

    const drawCount = events.filter(e => e.type === 'draw').length;
    expect(drawCount).toBe(4); // 예약 3장 + 이번 클릭 1장
    expect(state.teams['A'].pendingExtraDraws).toBe(0);
  });

  it(`SHEEP_SAFETY_CAP(${SHEEP_SAFETY_CAP})을 넘는 예약은 그 값에서 잘린다`, () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].pendingExtraDraws = SHEEP_SAFETY_CAP + 500;

    const events = drawCard(state, 'house', rng0);
    const bonus = events.find(e => e.type === 'bonusDraws');
    expect(bonus && bonus.type === 'bonusDraws' ? bonus.count : 0).toBe(SHEEP_SAFETY_CAP);
  });
});

// ─── 턴 진행 ─────────────────────────────────────────────────────────────────
describe('턴 진행', () => {
  it('B팀 플레이 후 턴 카운터 증가', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.activeTeam = 'B';
    advanceTurn(state);
    expect(state.turn).toBe(2);
  });

  it('A팀 플레이 후 턴 카운터 유지', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.activeTeam = 'A';
    advanceTurn(state);
    expect(state.turn).toBe(1);
  });

  it('MAX_TURN 초과 시 체력 비교로 게임이 종료된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.turn = MAX_TURN;
    state.activeTeam = 'B';
    state.teams.A.hp = 8;
    state.teams.B.hp = 5;
    const events = advanceTurn(state);
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('A');
    expect(events.some(e => e.type === 'gameEnd' && e.reason === 'turnLimit')).toBe(true);
  });

  it('이미 끝난 게임에 advanceTurn을 호출해도 아무 일도 일어나지 않는다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.phase = 'ended';
    state.turn = 5;
    state.activeTeam = 'A';
    const events = advanceTurn(state);
    expect(events).toEqual([]);
    expect(state.turn).toBe(5);
    expect(state.activeTeam).toBe('A');
  });

  it(`${FESTIVAL_TURN}턴 진입 시 축제가 시작되고(안내는 한 번만), 그 뒤로는 매 턴 계속 도토리 뽑기가 예약된다(기본 설정 n=1)`, () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.turn = FESTIVAL_TURN - 1;
    state.activeTeam = 'B';
    const events = advanceTurn(state);
    expect(state.turn).toBe(FESTIVAL_TURN);
    expect(state.festival).toBe(true);
    expect(events.filter(e => e.type === 'festival')).toHaveLength(1);
    // 실행 자체는 즉시 일어나지 않는다 — 실용신양과 동일하게, 다음 팀(A)에게 예약만 해둔다.
    expect(events.some(e => e.type === 'festivalDraws')).toBe(false);
    expect(events.some(e => e.type === 'draw')).toBe(false);
    expect(state.teams.A.pendingFestivalDraws).toBe(1);

    // 축제는 한 번 터지고 끝나는 이벤트가 아니다 — 다음 턴에도 계속 예약된다(안내 자막만 1회).
    state.activeTeam = 'B';
    const events2 = advanceTurn(state);
    expect(events2.some(e => e.type === 'festival')).toBe(false);
    expect(state.teams.A.pendingFestivalDraws).toBe(2); // 1(이전) + 1(이번) 누적
  });
});

// ─── 선 플레이어(firstTeam) 설정 ──────────────────────────────────────────────
describe('선 플레이어(firstTeam) 설정', () => {
  it('firstTeam을 지정하지 않으면 기존과 동일하게 A팀이 먼저 시작한다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    expect(state.activeTeam).toBe('A');
    expect(state.startingTeam).toBe('A');
    expect(state.startingTeamReason).toBe('setting');
  });

  it('firstTeam: "B"를 지정하면 B팀이 먼저 시작한다', () => {
    const state = initGame(['A1'], ['B1'], rng0, { firstTeam: 'B' });
    expect(state.activeTeam).toBe('B');
    expect(state.startingTeam).toBe('B');
    expect(state.startingTeamReason).toBe('setting');
  });

  it('firstTeam: "random"이면 rng 결과에 따라 A 또는 B가 정해지고 reason이 random으로 기록된다', () => {
    const stateA = initGame(['A1'], ['B1'], rng0, { firstTeam: 'random' });
    expect(stateA.startingTeam).toBe('A');
    expect(stateA.startingTeamReason).toBe('random');

    const stateB = initGame(['A1'], ['B1'], rngLast, { firstTeam: 'random' });
    expect(stateB.startingTeam).toBe('B');
    expect(stateB.startingTeamReason).toBe('random');
  });

  it('B팀이 먼저 시작해도(firstTeam: "B") 한 라운드(B→A)가 다 돈 뒤에만 턴 카운터가 오른다', () => {
    const state = initGame(['A1'], ['B1'], rng0, { firstTeam: 'B' });
    expect(state.activeTeam).toBe('B');
    expect(state.turn).toBe(1);

    // 선공(B)이 플레이를 마쳐도 아직 라운드가 안 끝났으므로 턴은 그대로다.
    advanceTurn(state);
    expect(state.turn).toBe(1);
    expect(state.activeTeam).toBe('A');

    // 후공(A)까지 플레이를 마쳐야 라운드가 끝나 턴 카운터가 오른다.
    advanceTurn(state);
    expect(state.turn).toBe(2);
    expect(state.activeTeam).toBe('B');
  });
});

// ─── 도토리 축제 랜덤 뽑기 (festivalTurn부터 매 턴 계속, k턴마다 단계가 올라 n×1→n×2→n×3...) ──
describe('도토리 축제 랜덤 뽑기', () => {
  it('festivalTurn부터 매 턴 계속 예약되고, k턴마다 단계가 올라 매 턴 예약 수가 n×1→n×2→n×3으로 늘어난다', () => {
    const state = initGame(['A1'], ['B1'], rng0, {
      festivalTurn: 3,
      festivalDrawCount: 2,
      festivalDrawIncreaseInterval: 2,
    });
    // advanceTurn은 매번 activeTeam을 B→A로 뒤집으므로(A의 턴은 턴 카운터를 올리지 않는다),
    // "B팀이 막 턴을 마쳤다"는 상황을 매번 다시 세팅해줘야 한다.
    const advanceAsB = () => {
      state.activeTeam = 'B';
      return advanceTurn(state);
    };
    // 이번 턴에 새로 예약된 만큼만 읽고, 다음 검증을 위해 소모된 것처럼 리셋한다.
    const drawnThisTurn = () => {
      const v = state.teams.A.pendingFestivalDraws;
      state.teams.A.pendingFestivalDraws = 0;
      return v;
    };

    state.turn = 1;
    advanceAsB();
    expect(state.turn).toBe(2);
    expect(drawnThisTurn()).toBe(0); // 아직 festivalTurn 전

    advanceAsB();
    expect(state.turn).toBe(3); // festivalTurn 도달 — 1단계: n×1=2
    expect(drawnThisTurn()).toBe(2);

    advanceAsB();
    expect(state.turn).toBe(4); // 같은 k구간(아직 1단계): n×1=2
    expect(drawnThisTurn()).toBe(2);

    advanceAsB();
    expect(state.turn).toBe(5); // k(2턴) 경과 — 2단계로 상승: n×2=4
    expect(drawnThisTurn()).toBe(4);

    advanceAsB();
    expect(state.turn).toBe(6); // 같은 k구간(아직 2단계): n×2=4
    expect(drawnThisTurn()).toBe(4);

    advanceAsB();
    expect(state.turn).toBe(7); // 다시 k턴 경과 — 3단계로 상승: n×3=6
    expect(drawnThisTurn()).toBe(6);
  });

  it('축제 중에는 A/B 어느 팀 차례든(라운드당 한 번이 아니라) 매 턴 다음 팀에게 예약된다', () => {
    const state = initGame(['A1'], ['B1'], rng0, { festivalTurn: 1, festivalDrawCount: 3 });
    state.festival = true; // 이미 축제가 시작된 상태에서 검증

    // A팀이 막 플레이를 마침 → 다음 팀(B)에게 예약되어야 한다 (기존 버그: A에게만 쌓였음)
    state.activeTeam = 'A';
    advanceTurn(state);
    expect(state.teams.B.pendingFestivalDraws).toBe(3);
    expect(state.teams.A.pendingFestivalDraws).toBe(0);

    // B팀이 막 플레이를 마침 → 다음 팀(A)에게 예약되어야 한다
    state.activeTeam = 'B';
    advanceTurn(state);
    expect(state.teams.A.pendingFestivalDraws).toBe(3);
  });

  it('festivalDrawIncreaseInterval=999(사실상 무제한)이면 단계 상승 없이 festivalTurn 이후 매 턴 항상 n×1회만 예약된다', () => {
    const state = initGame(['A1'], ['B1'], rng0, { festivalTurn: 3, festivalDrawCount: 5, festivalDrawIncreaseInterval: 999 });
    const advanceAsB = () => {
      state.activeTeam = 'B';
      return advanceTurn(state);
    };

    state.turn = 2;
    advanceAsB();
    expect(state.turn).toBe(3);
    expect(state.teams.A.pendingFestivalDraws).toBe(5);
    state.teams.A.pendingFestivalDraws = 0;

    state.turn = MAX_TURN - 1;
    advanceAsB();
    expect(state.turn).toBe(MAX_TURN);
    expect(state.teams.A.pendingFestivalDraws).toBe(5); // MAX_TURN 근처에서도 여전히 n×1
  });

  it('festivalTurn이 MAX_TURN보다 크면 암묵적으로 MAX_TURN 그 자체로 취급되어, 마지막 턴에는 축제가 열린다', () => {
    // festivalTurn을 그대로 썼다면(MAX_TURN + 50) turn이 그 값에 절대 도달할 수 없어
    // 게임이 끝날 때까지 축제가 영영 안 열려야 하지만, 암묵적으로 MAX_TURN까지 clamp되므로
    // 실제로는 마지막 턴(MAX_TURN)에 열린다.
    const state = initGame(['A1'], ['B1'], rng0, { festivalTurn: MAX_TURN + 50, festivalDrawCount: 4 });
    const advanceAsB = () => {
      state.activeTeam = 'B';
      return advanceTurn(state);
    };

    // 마지막 턴 직전까지는 아직 축제가 열리지 않는다
    state.turn = MAX_TURN - 2;
    const beforeLast = advanceAsB();
    expect(state.turn).toBe(MAX_TURN - 1);
    expect(state.festival).toBe(false);
    expect(beforeLast.some(e => e.type === 'festival')).toBe(false);

    // 마지막 턴(MAX_TURN)에 도달하는 순간 열린다
    const atLast = advanceAsB();
    expect(state.turn).toBe(MAX_TURN);
    expect(state.festival).toBe(true);
    expect(atLast.some(e => e.type === 'festival')).toBe(true);
    expect(state.teams.A.pendingFestivalDraws).toBe(4); // n×1단계, 다음 팀(A)에게 예약
  });

  it('예약된 도토리 뽑기는 실용신양(pendingExtraDraws)과 별도로 쌓이고, 다음 장소 클릭에서 실용신양보다 나중에 소모된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams.A.pendingFestivalDraws = 2;
    state.teams.A.pendingExtraDraws = 1;

    const events = drawCard(state, 'house', rng0);
    const festivalEv = events.find(e => e.type === 'festivalDraws');
    const bonusEv = events.find(e => e.type === 'bonusDraws');
    expect(festivalEv).toMatchObject({ type: 'festivalDraws', team: 'A', count: 2 });
    expect(bonusEv).toMatchObject({ type: 'bonusDraws', team: 'A', count: 1 });
    expect(events.indexOf(bonusEv!)).toBeLessThan(events.indexOf(festivalEv!));

    const drawCount = events.filter(e => e.type === 'draw').length;
    expect(drawCount).toBe(4); // 도토리 2장 + 실용신양 1장 + 이번 클릭 1장
    expect(state.teams.A.pendingFestivalDraws).toBe(0);
    expect(state.teams.A.pendingExtraDraws).toBe(0);
  });

  it(`SHEEP_SAFETY_CAP(${SHEEP_SAFETY_CAP})을 넘는 예약은 그 값에서 잘린다`, () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams.A.pendingFestivalDraws = SHEEP_SAFETY_CAP + 500;

    const events = drawCard(state, 'house', rng0);
    const festivalEv = events.find(e => e.type === 'festivalDraws');
    expect(festivalEv).toMatchObject({ type: 'festivalDraws', count: SHEEP_SAFETY_CAP });
  });
});

// ─── 즉시 승패(체력 WIN_HP 이상 / 0 이하) ───────────────────────────────────────
describe('체력 즉시 승패', () => {
  it('상표토끼로 체력이 WIN_HP에 닿으면 즉시 승리하고, 턴은 넘어가지 않는다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    // level = (WIN_HP - INITIAL_HP) / 1(배율) 이 되도록 경험치를 채운다 — 딱 그 레벨만큼
    // 체력이 올라 정확히 WIN_HP에 닿는다.
    state.teams['A'].exp.rabbit = (WIN_HP - INITIAL_HP) * THRESHOLDS.rabbit;
    state.pendingChoice = 'A';

    const { state: s2, events } = processSkillChoice(state, 'rabbit');
    expect(s2.teams.A.hp).toBe(WIN_HP);
    expect(s2.phase).toBe('ended');
    expect(s2.winner).toBe('A');
    expect(events.some(e => e.type === 'gameEnd' && e.reason === 'knockout')).toBe(true);
    // 녹아웃이므로 advanceTurn이 실행되지 않아 턴/활성팀이 그대로다
    expect(s2.pendingChoice).toBeNull();
    expect(s2.turn).toBe(1);
    expect(s2.activeTeam).toBe('A');
  });

  it('특허랑이로 상대 체력을 0으로 만들면 즉시 승리한다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.tiger = 20; // level=1
    state.teams['A'].pendingMultiplier = 5; // amount=5
    state.teams['B'].hp = 5;
    state.pendingChoice = 'A';

    const { state: s2, events } = processSkillChoice(state, 'tiger');
    expect(s2.teams.B.hp).toBe(0);
    expect(s2.phase).toBe('ended');
    expect(s2.winner).toBe('A');
    expect(events.some(e => e.type === 'gameEnd' && e.reason === 'knockout')).toBe(true);
  });
});

// ─── 카드 선택 ↔ 행동 선택 대기 상태 ───────────────────────────────────────────
describe('장소 클릭 후에는 행동을 고를 때까지 턴이 넘어가지 않는다', () => {
  it('processPlayerAction 직후 pendingChoice가 세팅되고 activeTeam은 그대로다 (고를 수 있는 행동이 있을 때만)', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.sheep = 10; // level=1이어야 고를 행동이 있어 대기 상태가 된다
    const { state: s1 } = processPlayerAction(state, 'house', rng0);
    expect(s1.pendingChoice).toBe('A');
    expect(s1.activeTeam).toBe('A');
  });

  it('고를 수 있는 행동이 하나도 없어도 pendingChoice가 세팅되어 직접 패스해야 턴이 넘어간다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    const { state: s1, events } = processPlayerAction(state, 'house', rng0);
    expect(s1.pendingChoice).toBe('A');
    expect(s1.activeTeam).toBe('A');
    expect(events.some(e => e.type === 'skillPassed')).toBe(false);

    const { state: s2, events: passEvents } = processPass(s1);
    expect(s2.pendingChoice).toBeNull();
    expect(s2.activeTeam).toBe('B');
    const passEv = passEvents.find(e => e.type === 'skillPassed');
    expect(passEv).toMatchObject({ type: 'skillPassed', team: 'A', auto: false });
  });

  it('pendingChoice가 있는 동안 추가 장소 클릭은 무시된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.sheep = 10;
    const { state: s1 } = processPlayerAction(state, 'house', rng0);
    const { events } = processPlayerAction(s1, 'house', rng0);
    expect(events).toHaveLength(0);
  });

  it('행동을 고르면 pendingChoice가 풀리고 턴이 다음 팀으로 넘어간다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.teams['A'].exp.sheep = 10; // level=1이어야 실제로 적용된다
    const { state: s1 } = processPlayerAction(state, 'house', rng0);
    const { state: s2, events } = processSkillChoice(s1, 'sheep');
    expect(s2.pendingChoice).toBeNull();
    expect(s2.activeTeam).toBe('B');
    expect(events.some(e => e.type === 'skillApplied')).toBe(true);
  });
});

// ─── 직전 장소 금지 ────────────────────────────────────────────────────────────
describe('직전 장소 금지 — 같은 장소만 계속 노리는 걸 막는다', () => {
  it('장소를 클릭하면 lastPlace가 그 장소로 기록된다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    expect(state.lastPlace).toBeNull();
    const { state: s1 } = processPlayerAction(state, 'house', rng0);
    expect(s1.lastPlace).toBe('house');
  });

  it('직전에 쓴 장소를 다시 클릭하면 아무 일도 일어나지 않는다(뽑기 없음, 턴도 그대로)', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    const { state: s1 } = processPlayerAction(state, 'house', rng0);
    // house는 행동 없이 넘겼다고 가정하고 바로 다음 팀 차례로 만든다.
    const { state: s2 } = processPass(s1);
    expect(s2.activeTeam).toBe('B');
    expect(s2.lastPlace).toBe('house'); // B팀 차례가 되어도 직전 장소 기록은 유지된다

    const stackSizeBefore = s2.stacks.rabbit.length; // s1에서 이미 house 클릭으로 1장 쌓여 있다
    const { state: s3, events } = processPlayerAction(s2, 'house', rng0);
    expect(events).toHaveLength(0); // 거부됨 — draw 이벤트조차 없다
    expect(s3.pendingChoice).toBeNull(); // 턴이 전혀 진행되지 않았다
    expect(s3.stacks.rabbit).toHaveLength(stackSizeBefore); // 새로 뽑힌 카드가 없다
  });

  it('직전 장소가 아닌 다른 장소는 정상적으로 뽑힌다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    const { state: s1 } = processPlayerAction(state, 'house', rng0);
    const { state: s2 } = processPass(s1);

    const { state: s3, events } = processPlayerAction(s2, 'dock', rng0);
    expect(events.some(e => e.type === 'draw')).toBe(true);
    expect(s3.lastPlace).toBe('dock'); // 새로 클릭한 장소로 갱신된다
  });

  it('제한시간 초과로 서버가 대신 장소를 고를 때도 직전 장소는 후보에서 빠진다', () => {
    const state = initGame(['A1'], ['B1'], rng0);
    state.lastPlace = 'house'; // house가 금지된 상태를 직접 세팅
    // rng0는 항상 배열의 0번째를 고르는데, house를 제외한 후보(forest_road, dock,
    // river_road) 중 0번째는 forest_road다 — house가 아니어야 통과한다.
    const { state: s1, events } = processTimeout(state, rng0);
    const drawEv = events.find(e => e.type === 'draw');
    expect(drawEv && drawEv.type === 'draw' ? drawEv.place : null).not.toBe('house');
    expect(s1.lastPlace).not.toBe('house');
  });
});
