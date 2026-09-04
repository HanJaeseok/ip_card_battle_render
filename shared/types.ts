export type Animal = 'sheep' | 'rabbit' | 'mermaid' | 'tiger';
export type Team = 'A' | 'B';

// ─── 자리(Seat) — 두 팀 + 관전석 ──────────────────────────────────────────────
// 로비에서 고를 수 있는 자리는 "팀 1 / 팀 2 / 관전자" 셋이다. 관전자는 게임 진행에
// 아무 영향도 주지 않고 구경만 하는 자리라, 게임 엔진(GameState/TeamState)에는 아예
// 존재하지 않는다 — Team은 여전히 'A'|'B' 둘뿐이고, 관전석은 방(Room)과 화면에만
// 있는 개념이다. 엔진 쪽 타입에 'spectator'를 섞지 말 것(정산·턴 교대·승패 판정이
// 전부 두 팀을 전제로 짜여 있다).
export const SPECTATOR = 'spectator';
export type Seat = Team | typeof SPECTATOR;
export const SEATS: Seat[] = ['A', 'B', SPECTATOR];

/** 이 자리가 실제로 게임을 뛰는 팀인지(=관전석이 아닌지). */
export function isPlayingSeat(seat: Seat): seat is Team {
  return seat === 'A' || seat === 'B';
}
export type CardNum = 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type GamePhase = 'lobby' | 'playing' | 'ended';

// 맵 네 모서리의 장소 — 각 장소를 클릭하면 괄호 안 동물 중 하나가 무작위로 나온다.
export type Place = 'house' | 'forest_road' | 'dock' | 'river_road';

export const PLACES: Place[] = ['house', 'forest_road', 'dock', 'river_road'];

export const PLACE_ANIMALS: Record<Place, Animal[]> = {
  house: ['rabbit', 'sheep'],               // 오두막 — 토끼, 양
  forest_road: ['rabbit', 'sheep', 'tiger'], // 숲길 — 토끼, 양, 호랑이
  dock: ['mermaid', 'tiger'],                // 부둣가 — 인어, 호랑이
  river_road: ['mermaid', 'rabbit', 'sheep'], // 강가 — 인어, 토끼, 양 (호랑이는 나오지 않는다)
};

// 중앙 동물 스택에 쌓이는 카드 한 장. 뽑히는 즉시 공개되므로 숨김 상태가 없다.
export interface StackedCard {
  id: number;
  animal: Animal;
  num: CardNum;
  collectedBy: Team | null;
}

// 동물별로 그 스킬을 몇 번, 총 몇 레벨어치 사용했는지 기록(결과 화면 통계용).
export interface SkillUsageStat {
  count: number;
  totalLevel: number;
  totalHpGained: number;   // 이 동물로 얻은 체력 총합 (토끼=회복분, 호랑이=강탈분, 양/인어=0)
  totalExtraDraws: number; // 양으로 예약한 추가 뽑기 총합 (양 외 0)
}

export interface TeamState {
  members: string[];
  exp: Record<Animal, number>;    // 동물별 누적 경험치 = 카드 숫자 합. 레벨 = floor(exp/threshold)
  hp: number;                      // 체력(=점수) — settings.targetScore에서 시작, 그 두 배 이상이면 승리, 0 이하면 패배
  pendingMultiplier: number;       // 디자인어가 키우는 대기 배율. 초기값 1, 인어를 쓸 때마다 그 레벨만큼
                                    // 더해진다(1 + 누적 레벨 = 다음 행동이 발동하는 총 횟수). 인어 외 스킬을 쓰면 1로 초기화
  pendingExtraDraws: number;       // 실용신양 스킬로 예약된, 다음 내 턴에 추가로 뽑을 카드 수
  pendingFestivalDraws: number;    // 도토리 축제로 예약된, 다음 내 턴에 추가로 뽑을 카드 수(실용신양과 동일한 방식)
  playerIndex: number;             // 팀 내 현재 차례 플레이어 인덱스 (N:N 로테이션)
  skillStats: Record<Animal, SkillUsageStat>; // 결과 화면에 표시할 스킬 사용 통계
}

// 방장이 방 생성 시 정하는 게임 규칙 — 기본값은 shared/constants.ts의 DEFAULT_* 참조.
export interface GameSettings {
  firstTeam: 'A' | 'B' | 'random'; // 선 플레이어(먼저 시작하는 팀) — 'random'이면 게임 시작 시 서버가 무작위로 정한다
  targetScore: number;    // 목표 점수 — 시작 체력이자 승리에 필요한 격차(시작 hp = targetScore, winHp = targetScore × 2)
  festivalTurn: number;   // 도토리 축제 시작 턴
  festivalDrawCount: number;           // 도토리 축제 랜덤 뽑기 발동 횟수(n) — festivalTurn에 n×1회 발동
  festivalDrawIncreaseInterval: number; // 이후 이 턴(k)마다 발동 횟수가 n×2, n×3...으로 늘어난다(기본 999=사실상 재발동 없음)
  drawTimeSec: number;    // 동물 뽑기(장소 클릭) 제한시간
  actionTimeSec: number;  // 행동 선택 제한시간 — 고를 수 있는 행동이 있을 때
  noActionTimeSec: number; // 행동 선택 제한시간 — 고를 수 있는 행동이 하나도 없을 때
}

export interface GameState {
  phase: GamePhase;
  turn: number;
  activeTeam: Team;
  activePlayerIndex: number;
  stacks: Record<Animal, StackedCard[]>;      // 동물별 중앙 카드 스택 (수집된 카드도 기록으로 남음)
  // 직전에(어느 팀이든) 실제로 클릭해서 뽑은 장소 — 같은 장소만 계속 노리는 게 너무
  // 유리해서, 바로 다음 차례에는 이 장소를 고를 수 없다(server/engine/gameEngine.ts의
  // processPlayerAction 참고). 실용신양/도토리 축제로 예약된 추가 뽑기는 무작위 장소에서
  // 알아서 일어나는 것이라 여기에 영향을 주지 않는다 — 오직 "직접 클릭한" 장소만 기억한다.
  lastPlace: Place | null;
  festival: boolean;                          // settings.festivalTurn 이후 여부 — 이때부터 도토리 축제 랜덤 뽑기가 발동한다
  pendingChoice: Team | null;                 // 턴을 마친 팀이 5가지 선택지(행동 4종 + 패스) 중 하나를 고르길 기다리는 중
  teams: Record<Team, TeamState>;
  winner: Team | 'draw' | null;
  settings: GameSettings;                     // 방장이 정한(또는 기본값) 게임 규칙 — 방 생성 시 확정되어 게임 중 불변
  startingTeam: Team;                         // 이 게임에서 실제로 먼저 시작한 팀 — settings.firstTeam이 'random'이어도 이미 추첨이 끝난 확정값
  startingTeamReason: 'setting' | 'random';   // startingTeam이 방장 설정으로 정해졌는지 무작위 추첨으로 정해졌는지
}

// 게임 이벤트 (클라이언트 연출 및 시뮬레이션 로그용)
export type GameEvent =
  | { type: 'draw'; place: Place; card: StackedCard }
  | {
      type: 'collect';
      animal: Animal;
      team: Team;
      exp: number;      // 카드 숫자 합 — 이 페어를 정산해 실제로 더해진 경험치
      cardIds: number[];
    }
  | { type: 'bonusDraws'; team: Team; count: number } // 실용신양 스킬로 예약해둔 추가 뽑기를 이번 턴에 소모
  | { type: 'festivalDraws'; team: Team; count: number } // 도토리 축제로 예약해둔 추가 뽑기를 이번 턴에 소모(실용신양과 동일한 방식)
  | {
      type: 'skillApplied';
      team: Team;
      animal: Animal;
      level: number;            // 발동에 사용된(초기화 직전) 레벨. 0이면 아무 일도 없었다는 뜻
      expSpent: number;         // level × threshold — 소모된 경험치
      multiplierUsed: number;   // 이번 발동에 실제로 곱해진 배율(=총 발동 횟수, 인어일 때는 항상 1)
      multiplierAfter: number;  // 발동 후 그 팀의 pendingMultiplier(인어면 레벨만큼 늘어난 값, 나머지는 1)
      myHpDelta: number;        // 내 체력 증감 — 항상 0 이상
      oppHpDelta: number;       // 상대 체력 증감 — 항상 0 이하(음수 그대로, 양수로 뒤집지 않는다)
      extraDrawsQueued: number; // 양을 골랐을 때, 다음 내 턴에 예약된 추가 뽑기 수(배율 반영 후 최종값)
      hpAfter: Record<Team, number>; // 적용 직후 양 팀 체력
    }
  | { type: 'skillPassed'; team: Team; auto: boolean } // "아무것도 하지 않음"을 선택(auto=true면 고를 수 있는 행동이 없어 화면에 알리지 않고 자동 처리)
  | { type: 'festival' } // FESTIVAL_TURN 도달 — 이때부터 도토리 축제 랜덤 뽑기가 발동한다
  | { type: 'gameEnd'; winner: Team | 'draw'; reason: 'knockout' | 'turnLimit' }
  | { type: 'timeout'; place: Place }
  | { type: 'timeoutChoice'; animal: Animal | null }; // 행동 선택 제한시간 초과 — null이면 고를 행동이 없어 자동 패스
