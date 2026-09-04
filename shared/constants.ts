import type { GameSettings } from './types';

// 동물별 레벨 임계값 — level = floor(exp / threshold)
export const THRESHOLDS = { sheep: 10, rabbit: 10, mermaid: 20, tiger: 20 } as const;

// 체력(=점수) 규칙 — 시작 체력은 목표 점수(GameSettings.targetScore) 그 자체이고,
// 그 두 배(=시작 체력 + 목표 점수)에 닿으면 즉시 승리, 0 이하면 즉시 패배다.
// 아래 INITIAL_HP/WIN_HP는 "기본 규칙(targetScore=DEFAULT_TARGET_SCORE)일 때의 값"을
// 나타내는 참고용 상수일 뿐, 실제 게임 로직은 항상 state.settings.targetScore로 계산한다
// (server/engine/turnManager.ts의 winHpOf, initGame 참조).
export const INITIAL_HP = 10;
export const WIN_HP = 20;
export const LOSE_HP = 0;

// 축제 시작 턴(기본값) — 방장이 방 생성 시 바꿀 수 있다(GameSettings.festivalTurn) —
// "축제가 시작되는 첫 턴"이라 turn >= festivalTurn으로 판정한다.
export const FESTIVAL_TURN = 6;

// 축제가 열리면 실용신양과 동일한 방식(무작위 장소에서 카드 뽑기)의 "도토리 뽑기"가
// festivalDrawCount(n)회 발동한다. 이후 festivalDrawIncreaseInterval(k)턴마다
// 발동 횟수가 n×1 → n×2 → n×3 ... 처럼 등차수열로 늘어난다(server/engine/turnManager.ts 참조).
export const DEFAULT_FESTIVAL_DRAW_COUNT = 1;
export const DEFAULT_FESTIVAL_DRAW_INCREASE_INTERVAL = 2;

// 방장이 방 생성 시 정할 수 있는 게임 규칙의 기본값 — GameSettings 참조.
// firstTeam 기본값은 'A' — 이 설정이 생기기 전부터 항상 A팀이 먼저 시작했던 기존 동작을
// 그대로 유지한다(방장이 명시적으로 바꿔야만 B/무작위로 바뀐다).
export const DEFAULT_FIRST_TEAM: 'A' | 'B' | 'random' = 'A';
// targetScore(목표 점수) — 시작 체력이자 승리에 필요한 격차(시작 체력 = targetScore,
// winHp = targetScore × 2). 기본값 10이면 체력 10에서 시작해 20 이상이면 즉시 승리.
export const DEFAULT_TARGET_SCORE = 7;
export const DEFAULT_FESTIVAL_TURN = FESTIVAL_TURN;
export const DEFAULT_DRAW_TIME_SEC = 30;
export const DEFAULT_ACTION_TIME_SEC = 15;
export const DEFAULT_NO_ACTION_TIME_SEC = 3;

// 방 생성 화면에서 입력값을 이 범위로 잘라낸다(서버도 방어적으로 다시 clamp한다).
export const SETTINGS_LIMITS = {
  targetScore: { min: 1, max: 100 },
  // MAX_TURN(20)보다 크게 입력해도 막지 않는다 — 그런 값은 engine/turnManager.ts가
  // 내부적으로 MAX_TURN으로 취급해(암묵적으로 clamp) 마지막 턴에 축제가 열리게 한다.
  festivalTurn: { min: 1, max: 999 },
  festivalDrawCount: { min: 1, max: 20 },
  festivalDrawIncreaseInterval: { min: 1, max: 999 },
  drawTimeSec: { min: 5, max: 120 },
  actionTimeSec: { min: 5, max: 60 },
  noActionTimeSec: { min: 2, max: 30 },
} as const;

export const DEFAULT_SETTINGS: GameSettings = {
  firstTeam: DEFAULT_FIRST_TEAM,
  targetScore: DEFAULT_TARGET_SCORE,
  festivalTurn: DEFAULT_FESTIVAL_TURN,
  festivalDrawCount: DEFAULT_FESTIVAL_DRAW_COUNT,
  festivalDrawIncreaseInterval: DEFAULT_FESTIVAL_DRAW_INCREASE_INTERVAL,
  drawTimeSec: DEFAULT_DRAW_TIME_SEC,
  actionTimeSec: DEFAULT_ACTION_TIME_SEC,
  noActionTimeSec: DEFAULT_NO_ACTION_TIME_SEC,
};

/** 방장 입력값을 SETTINGS_LIMITS 범위로 잘라내고, 정수가 아니면 반올림한다. */
export function clampSettings(input: Partial<typeof DEFAULT_SETTINGS> | undefined): typeof DEFAULT_SETTINGS {
  const merged = { ...DEFAULT_SETTINGS, ...input };
  const clamp = (key: keyof typeof SETTINGS_LIMITS) => {
    const { min, max } = SETTINGS_LIMITS[key];
    const v = Math.round(Number(merged[key]));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_SETTINGS[key];
  };
  const firstTeam =
    merged.firstTeam === 'A' || merged.firstTeam === 'B' || merged.firstTeam === 'random'
      ? merged.firstTeam
      : DEFAULT_SETTINGS.firstTeam;
  return {
    firstTeam,
    targetScore: clamp('targetScore'),
    festivalTurn: clamp('festivalTurn'),
    festivalDrawCount: clamp('festivalDrawCount'),
    festivalDrawIncreaseInterval: clamp('festivalDrawIncreaseInterval'),
    drawTimeSec: clamp('drawTimeSec'),
    actionTimeSec: clamp('actionTimeSec'),
    noActionTimeSec: clamp('noActionTimeSec'),
  };
}

export const MAX_TURN = 20;
export const TURN_TIME_SEC = 30;

/** festivalDrawInfoAt의 결과 — "이번 턴 몇 회, 그리고 언제 몇 회로 올라가는지". */
export interface FestivalDrawInfo {
  /** 그 턴에 예약되는 도토리 뽑기 횟수(n × 단계). 축제 시작 전이면 0. */
  count: number;
  /** 다음 강화까지 남은 턴 수. MAX_TURN 안에서 강화될 일이 없으면 null. */
  turnsToNextStage: number | null;
  /** 강화된 뒤의 뽑기 횟수. turnsToNextStage가 null이면 같이 null. */
  nextCount: number | null;
}

/**
 * 어떤 턴에 예약되는 도토리 축제 랜덤 뽑기 정보 — 서버의 예약 계산(engine/turnManager.ts)과
 * 클라이언트 헤더 안내가 반드시 같은 식을 쓰도록 여기 한 곳에 모아둔다.
 *
 * 단계는 festivalTurn부터 k(festivalDrawIncreaseInterval)턴마다 한 칸씩 올라가고,
 * 그 턴의 횟수는 n(festivalDrawCount) × 단계다. k가 크거나 이미 막판이라 다음 단계 턴이
 * MAX_TURN을 넘으면 "강화될 일이 없다"는 뜻이므로 예고값을 null로 돌려준다.
 */
export function festivalDrawInfoAt(turn: number, settings: GameSettings): FestivalDrawInfo {
  const { festivalDrawCount, festivalDrawIncreaseInterval } = settings;
  // MAX_TURN을 넘는 festivalTurn은 advanceTurn과 동일하게 MAX_TURN 그 자체로 취급한다
  // (그렇지 않으면 축제가 열렸는데도 매번 0회로 잘못 계산될 수 있다).
  const festivalTurn = Math.min(settings.festivalTurn, MAX_TURN);
  if (turn < festivalTurn) return { count: 0, turnsToNextStage: null, nextCount: null };

  const stage = Math.floor((turn - festivalTurn) / festivalDrawIncreaseInterval) + 1;
  const nextStageTurn = festivalTurn + stage * festivalDrawIncreaseInterval;
  const reachable = nextStageTurn <= MAX_TURN;
  return {
    count: festivalDrawCount * stage,
    turnsToNextStage: reachable ? nextStageTurn - turn : null,
    nextCount: reachable ? festivalDrawCount * (stage + 1) : null,
  };
}

// 실용신양 스킬로 예약된 추가 뽑기 1회 소모당 상한 (무한루프/과도한 뽑기 방지)
export const SHEEP_SAFETY_CAP = 40;

// ─── 시작 공유 카드 ───────────────────────────────────────────────────────────
// 빈 보드에서 시작하면 선 플레이어는 무엇을 뽑아도 짝을 만들 수 없고(스택이 비어 있으니),
// 그 짝은 바로 다음 차례인 상대가 가져간다 — 선 플레이어에게 구조적으로 불리한 구조다.
// 이를 없애기 위해 게임 시작 시 어느 팀 것도 아닌 "공유 카드"를 중앙에 미리 깔아둔다.
// 두 장은 반드시 서로 다른 동물이라(같은 동물이면 그 자리에서 짝이 되어버린다) 시작
// 시점에는 어떤 스택도 정산되지 않는다.
export const OPENING_SHARED_CARD_COUNT = 2;
// 공유 카드의 숫자 범위 — 장소별 뽑기(5~10 / 10~15)의 한가운데를 걸쳐, 어느 쪽으로도
// 지나치게 유리하거나 불리하지 않은 값만 나오게 한다.
export const OPENING_SHARED_CARD_NUM_MIN = 7;
export const OPENING_SHARED_CARD_NUM_MAX = 13;

export const ANIMALS = ['sheep', 'rabbit', 'mermaid', 'tiger'] as const;

// 팀 이름 최대 글자 수 — 게임 화면 팀 패널이 감당할 수 있는 길이(서버도 이 값으로 자른다).
export const TEAM_NAME_MAX_LEN = 12;
// 닉네임 최대 글자 수 — 입력창(maxLength)과 서버 정리(normalizeNickname)가 같은 값을 쓴다.
export const NICKNAME_MAX_LEN = 12;

// ─── 대기실 채팅 ─────────────────────────────────────────────────────────────
// 한 메시지 최대 길이 — 넘치면 서버가 잘라서 브로드캐스트한다.
export const CHAT_MAX_LEN = 200;
// 방이 보관하는 최근 메시지 수(링 버퍼) — 나중에 들어온 사람이 받는 대화 기록의 길이이자,
// 방 하나가 붙들고 있는 메모리의 상한이다.
export const CHAT_HISTORY_MAX = 50;
// 같은 사람의 연속 전송 최소 간격(ms) — 클라이언트가 먼저 억제하고, 서버는 안전망으로
// 이 간격 안에 도착한 메시지를 조용히 버린다.
export const CHAT_MIN_INTERVAL_MS = 400;

// 방을 만들 때 팀 이름을 정하지 않으면 `shared/names.ts`의 randomTeamName이 상대 팀과
// 겹치지 않는 이름을 무작위로 배정한다(닉네임 무작위 생성도 같은 파일에 있다).

// 실용신양 스킬로 예약된 추가 뽑기 1회당 턴 제한시간 연장(초) — 30초 + 10×n
export const SHEEP_EXTRA_TIME_PER_DRAW_SEC = 10;
// 배율이 실린 예약 뽑기가 턴 제한시간을 무한정 늘리지 않도록, 시간 연장 계산에는
// 이 값까지만 반영한다(실제 뽑기 횟수 자체는 SHEEP_SAFETY_CAP까지 그대로 진행된다).
export const SHEEP_TIMER_EXTRA_DRAW_CAP = 6;
