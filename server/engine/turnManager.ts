import { MAX_TURN, LOSE_HP, clampSettings, festivalDrawInfoAt } from 'shared';
import type { GameEvent, GameSettings, GameState, Team } from 'shared';
import { dealOpeningSharedCards, initStacks } from './places';
import type { RNG } from './places';

/**
 * 시작 체력 = 목표 점수 그 자체다 — 목표 점수만큼 "더 벌거나 잃어야" 끝나는 게임이므로,
 * 목표 점수가 6이면 6에서 시작해 12에 닿으면 승리, 0에 닿으면 패배다.
 */
function winHpOf(state: GameState): number {
  return state.settings.targetScore * 2;
}

function determineWinnerByHp(state: GameState): Team | 'draw' {
  const a = state.teams.A.hp;
  const b = state.teams.B.hp;
  if (a > b) return 'A';
  if (b > a) return 'B';
  return 'draw';
}

/** 게임 종료를 한 곳에서 처리한다 — phase/winner/pendingChoice를 모두 정리하고 gameEnd를 낸다. */
function endGame(state: GameState, winner: Team | 'draw', reason: 'knockout' | 'turnLimit'): GameEvent[] {
  state.phase = 'ended';
  state.winner = winner;
  state.pendingChoice = null;
  return [{ type: 'gameEnd', winner, reason }];
}

/**
 * 체력 즉시 승패 판정 — 행동을 적용한 직후(=턴을 넘기기 전)에 호출된다.
 * 체력은 오직 상표토끼(자신)·특허랑이(상대에게서 강탈)로만 움직이므로, 이론상 두 팀이
 * 동시에 승리 조건을 만족할 수 없다. 그래도 방어적으로 무승부 분기를 남겨둔다.
 */
export function checkKnockout(state: GameState): GameEvent[] {
  if (state.phase !== 'playing') return [];

  const winHp = winHpOf(state);
  const aWins = state.teams.A.hp >= winHp || state.teams.B.hp <= LOSE_HP;
  const bWins = state.teams.B.hp >= winHp || state.teams.A.hp <= LOSE_HP;
  if (!aWins && !bWins) return [];
  if (aWins && bWins) return endGame(state, 'draw', 'knockout');
  return endGame(state, aWins ? 'A' : 'B', 'knockout');
}

/**
 * 턴 종료 공통 경로 — 행동 선택(또는 패스) 직후 반드시 이걸 거친다.
 * 즉시 승패가 났으면 턴을 넘기지 않고 그대로 게임을 끝낸다.
 */
export function finishTurn(state: GameState): GameEvent[] {
  const ko = checkKnockout(state);
  if (ko.length > 0) return ko;
  return advanceTurn(state);
}

/**
 * 도토리 축제 랜덤 뽑기 — settings.festivalTurn에 도달한 턴부터는 "그 턴부터 매 턴 계속"
 * n회씩 발동한다(한 번 터지고 끝나는 일회성 보너스가 아니다). 그리고 매 턴 같은 n회가
 * 아니라, settings.festivalDrawIncreaseInterval(k)턴이 지날 때마다 n×1 → n×2 → n×3 ...
 * 으로 단계가 한 번씩 올라가고, 그 단계의 n×stage가 이후 매 턴 유지된다(k를 999에 가깝게
 * 크게 잡으면 MAX_TURN 안에서 절대 2단계로 못 올라간다는 뜻일 뿐, n×1회가 festivalTurn
 * 이후 매 턴 계속 발동하는 것 자체는 그대로 적용된다).
 *
 * 실제 계산식은 shared/constants.ts의 festivalDrawInfoAt에 있다 — 클라이언트 헤더가
 * "지금 몇 회, 몇 턴 후 몇 회로 강화되는지"를 서버 예약과 똑같은 식으로 안내해야 하므로
 * 양쪽이 함께 쓰는 shared에 두었다.
 */

/**
 * 턴 종료 처리 — 행동 선택까지 모두 끝난 뒤에만(또는 checkKnockout이 통과한 뒤에만) 호출된다.
 *
 * 순서:
 * 1. 이미 끝난 게임은 절대 되살리지 않는다.
 * 2. 팀 교대 (선공→후공, 후공→선공)
 * 3. 후공 팀이 플레이를 마친 시점(=한 라운드가 다 돈 시점)에 턴 카운터 증가
 * 4. FESTIVAL_TURN 도달 시 축제 진입(안내는 1회) + 그 뒤로 "매 턴(플레이어 교대마다)" 다음
 *    차례 팀(A/B 구분 없이)에게 도토리 축제 랜덤 뽑기 예약
 * 5. MAX_TURN 초과 시 체력 비교로 게임 종료
 */
export function advanceTurn(state: GameState): GameEvent[] {
  if (state.phase !== 'playing') return [];

  const events: GameEvent[] = [];

  const currentTeam = state.activeTeam;
  const nextTeam: Team = currentTeam === 'A' ? 'B' : 'A';
  // 이 게임에서 매 라운드 "두 번째로" 플레이하는 팀 — settings.firstTeam이 A/B/무작위
  // 무엇이든, 라운드의 두 번째 팀이 플레이를 마쳐야 턴 카운터가 오른다(기존에는
  // 이 팀을 'B'로 못박아뒀는데, 선 플레이어를 고를 수 있게 되면서 일반화했다).
  const secondTeamOfRound: Team = state.startingTeam === 'A' ? 'B' : 'A';

  // 후공 팀이 플레이를 마친 경우 → 턴 카운터 증가
  if (currentTeam === secondTeamOfRound) {
    state.turn++;

    // settings.festivalTurn 도달 시점부터 축제가 시작된다. festivalTurn이 MAX_TURN보다
    // 크게 설정돼 있으면(입력 자체는 막지 않는다 — SETTINGS_LIMITS 참고) 그 턴엔 아예
    // 도달할 수 없어 축제가 영영 안 열리므로, MAX_TURN을 넘는 값은 암묵적으로 MAX_TURN
    // 그 자체로 취급한다 — 마지막 턴에라도 축제가 열리게 하는 것이다.
    const effectiveFestivalTurn = Math.min(state.settings.festivalTurn, MAX_TURN);
    if (!state.festival && state.turn >= effectiveFestivalTurn) {
      state.festival = true;
      events.push({ type: 'festival' });
    }
  }

  // 도토리 축제 랜덤 뽑기 — 실용신양과 완전히 동일하게, 즉시 뽑지 않고 다음으로 플레이할
  // 팀(nextTeam)의 pendingFestivalDraws에 예약해둔다. 실제 뽑기는 그 팀이 다음 장소를 클릭할 때
  // (server/engine/drawCard.ts) 실행된다. 축제 시작 이후로는 A/B 어느 팀 차례든 매 턴 계속
  // 예약된다 — "라운드당 한 번"이 아니라 "누구든 자기 턴이 오면 무조건" 받는 보너스다.
  if (state.festival) {
    const drawCount = festivalDrawInfoAt(state.turn, state.settings).count;
    if (drawCount > 0) {
      state.teams[nextTeam].pendingFestivalDraws += drawCount;
    }
  }

  // 종료 판정 — 턴 상한 초과 시 체력 비교
  if (state.turn > MAX_TURN) {
    return [...events, ...endGame(state, determineWinnerByHp(state), 'turnLimit')];
  }

  // 방금 플레이한 팀의 playerIndex를 다음 번을 위해 증가 (N:N 로테이션)
  const prevTeamState = state.teams[currentTeam];
  prevTeamState.playerIndex =
    (prevTeamState.playerIndex + 1) % prevTeamState.members.length;

  // 팀 교대 후 다음 팀의 현재 playerIndex를 activePlayerIndex에 반영
  state.activeTeam = nextTeam;
  state.activePlayerIndex = state.teams[nextTeam].playerIndex;

  return events;
}

/** 새 게임 상태 초기화 — settings를 생략하면 기본 규칙(shared/constants.ts DEFAULT_*)으로 시작한다. */
export function initGame(
  teamAMembers: string[],
  teamBMembers: string[],
  rng: RNG = Math.random,
  settings?: Partial<GameSettings>,
): GameState {
  const resolvedSettings = clampSettings(settings);

  // settings.firstTeam이 'random'이면 여기서 딱 한 번 추첨해 확정한다 — 이후로는
  // state.startingTeam이 그 결과를 그대로 담고 있으므로, 다시 추첨하거나 매번
  // 다르게 계산될 일이 없다.
  const startingTeam: Team =
    resolvedSettings.firstTeam === 'random'
      ? (rng() < 0.5 ? 'A' : 'B')
      : resolvedSettings.firstTeam;
  const startingTeamReason: 'setting' | 'random' =
    resolvedSettings.firstTeam === 'random' ? 'random' : 'setting';

  const makeTeam = (members: string[]) => ({
    members,
    exp: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 },
    hp: resolvedSettings.targetScore,
    pendingMultiplier: 1,
    pendingExtraDraws: 0,
    pendingFestivalDraws: 0,
    playerIndex: 0,
    skillStats: {
      sheep: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
      rabbit: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
      mermaid: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
      tiger: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
    },
  });

  // 선 플레이어의 불합리를 없애기 위한 시작 공유 카드 — 서로 다른 동물 두 장이 중앙에
  // 깔린 채로 게임이 시작된다(engine/places.ts의 dealOpeningSharedCards 참고).
  const stacks = initStacks();
  for (const card of dealOpeningSharedCards(rng)) {
    stacks[card.animal].push(card);
  }

  return {
    phase: 'playing',
    turn: 1,
    activeTeam: startingTeam,
    activePlayerIndex: 0,
    stacks,
    lastPlace: null,
    festival: false,
    pendingChoice: null,
    teams: {
      A: makeTeam(teamAMembers),
      B: makeTeam(teamBMembers),
    },
    winner: null,
    settings: resolvedSettings,
    startingTeam,
    startingTeamReason,
  };
}
