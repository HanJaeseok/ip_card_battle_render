'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Animal, ClientGameEvent, ClientGameState, Place, StackedCard, Team } from 'shared';
import { ANIMALS } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';
import { playRandomSound, playRandomSoundSequence } from '@/lib/sounds';
import { SLOT_SPIN_DUR, SLOT_TOTAL_DUR, WOOL_BALL_DUR, SHEEP_DRAW_STEP } from '@/lib/drawTiming';

type DeltaKey = `${Team}:${Animal}`;
const deltaKeyOf = (t: Team, a: Animal): DeltaKey => `${t}:${a}`;

// 해설판/자막에 쓰는 행동 발동 문구 — 동물이 아니라 그 동물이 상징하는 권리에 맞게 고른다
// ("토끼 지식재산의 힘!"처럼 아무 동물에나 같은 문구가 붙던 것을 동물별 전용 문구로 교체).
// "스킬"이라는 단어는 쓰지 않는다(사용자 요청 — "행동"으로 대체).
const ACTION_PHRASES: Record<Animal, string[]> = {
  sheep: ['빠르게 적용하는 실용신안의 힘!'],
  rabbit: ['영향력 개시', '상표의 힘!'],
  mermaid: ['보기좋은 떡이 먹기도 좋다', '디자인의 힘!'],
  tiger: ['특허권의 독점력!'],
};
function randomActionPhrase(animal: Animal): string {
  const phrases = ACTION_PHRASES[animal];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export interface FloatingTextItem {
  id: number;
  text: string;
  team: Team;
  type: 'bonus' | 'penalty';
  animal?: Animal;
}

export interface CommentaryLine {
  id: number;
  text: string;
  team: Team | null; // null = 중립 (예: 턴 전환)
}

export interface SheepCombo {
  id: number;
  place: Place; // 예약된 추가 뽑기로 카드가 뽑힌 장소
  combo: number; // 1부터 시작하는 콤보 번호
}

export interface MainCombo {
  id: number;
  combo: number; // 이번 연쇄의 최종 콤보 수
}

export interface SheepLoaded {
  id: number;
  team: Team;
  count: number; // 이번 액션에서 소모되는 예약된 추가 뽑기 수
}

export interface SheepProgress {
  team: Team;
  current: number; // 지금까지 소모한 예약 뽑기 수
  total: number;   // 이번에 소모해야 할 전체 예약 뽑기 수
}

export interface FestivalProgress {
  team: Team;
  current: number; // 지금까지 소모한 도토리 축제 예약 뽑기 수
  total: number;   // 이번에 소모해야 할 전체 도토리 축제 예약 뽑기 수
}

export interface RabbitFlight {
  id: number;
  team: Team; // 이 팀 체력 쪽으로 토끼떼(RabbitFlightLayer가 고정 개수로 그린다)가 달려간다
}

export interface RabbitPressure {
  sourceTeam: Team; // 토끼가 불어난 팀
  targetTeam: Team; // 압박을 느껴야 할 상대 팀
}

export interface CaptionItem {
  id: number;
  text: string;
  tier: 'pair' | 'effect'; // 페어 성사 / 행동 발동
  placeKey?: Place;
  stackAnimal?: Animal; // pair인데 앵커링할 카드를 못 찾았을 때의 대체 앵커(그 동물 스택 전체)
  anchorCardId?: number; // pair는 짝을 이룬 카드 중 가장 마지막(가장 오른쪽) 카드 바로 위에 앵커링
  team?: Team; // effect 자막 색상(우리팀 초록 / 상대팀 빨강 / 중립 금색) 판정용
}

export interface PlayerEmoticon {
  id: number;
  team: Team;
  playerIndex: number; // 팀 내 이 플레이어의 인덱스 (프로필 목록 앵커용)
  file: string;         // /emoticon/{file}.png
  // 화면상의 자리(몇 칸 아래인지)는 여기 담지 않는다 — 같은 앵커에 뜬 것들이 큐처럼
  // 위로 당겨져야 해서, PlayerEmoticonLayer가 매 렌더마다 목록 순서로 다시 센다.
  persist?: boolean;    // 게임 종료 좌절 연출 — 저절로 사라지지 않고 종료 화면으로 넘어갈 때까지 그대로 남는다
}

export interface PlaceFocusItem {
  id: number;
  place: Place;
}

export interface DrawSlotItem {
  id: number;
  place: Place;
  animal: Animal;
  num: number;
}

export interface WoolBallItem {
  id: number;
  team: Team;
  place: Place;
}

export interface AcornBallItem {
  id: number;
  team: Team;
  place: Place; // 도토리 축제 랜덤 뽑기 — 실용신양(WoolBallItem)과 동일하게 그 팀 프로필에서 장소로 날아간다
}

export interface FestivalLoaded {
  id: number;
  count: number; // 도토리 축제 랜덤 뽑기가 이번에 몇 회 발동했는지
}

export interface FestivalStartInfo {
  id: number;
  drawCount: number;       // settings.festivalDrawCount(n) — 이 방의 실제 설정값
  increaseInterval: number; // settings.festivalDrawIncreaseInterval(k)
}

export interface ShakingPile {
  id: number;
  animal: Animal; // 짝이 맞아 정산되기 직전, 그 동물 스택 전체가 "확인하듯" 흔들리는 연출
}

export interface HpPulse {
  id: number;
  direction: 'gain' | 'loss';
}

// client/public/emoticon/{animal}_{mood}.png — burn/cry/focus/happy/stone 다섯 종이 있다.
function emoticonFile(animal: Animal, mood: 'happy' | 'cry' | 'stone'): string {
  return `${animal}_${mood}`;
}

// 결정타를 맞은 팀이 짓는 표정 — 네 동물 각각 이 둘 중 하나를 무작위로 고른다.
const DESPAIR_MOODS = ['cry', 'stone'] as const;
function randomDespairMood(): (typeof DESPAIR_MOODS)[number] {
  return DESPAIR_MOODS[Math.floor(Math.random() * DESPAIR_MOODS.length)];
}

export interface AnimationState {
  screenShakeLevel: number; // 0 = none
  leafParticleCount: number;
  floatingTexts: FloatingTextItem[];
  sheepCombos: SheepCombo[];
  mainCombo: MainCombo | null;
  sheepLoaded: SheepLoaded | null;
  sheepProgress: SheepProgress | null; // 예약된 추가 뽑기가 지금 몇 번째까지 소모됐는지
  festivalProgress: FestivalProgress | null; // 도토리 축제 예약 뽑기가 지금 몇 번째까지 소모됐는지
  rabbitFlights: RabbitFlight[];
  rabbitPressure: RabbitPressure | null;
  tigerSlash: { onTeam: Team } | null;
  tigerRecoil: { attackerTeam: Team } | null;
  tigerImpact: boolean;
  mermaidPopup: { team: Team } | null;
  scoreFlash: ReadonlyMap<string, number>; // "team:animal" → flash id (for CSS re-trigger)
  displayedExp: Record<Team, Record<Animal, number>>; // 팀 패널에 실제로 보여주는 경험치 — 페어 카드가 팀으로 날아가 도착한 뒤에야 반영된다
  hpPulse: ReadonlyMap<Team, HpPulse>; // 체력 오브가 지금 상승/감소 연출 중인지
  festivalFlash: boolean; // 축제 진입 순간 보드 전체 섬광
  festivalBurst: boolean; // 축제 진입 순간 보드 여기저기 도토리 폭죽(15발)
  festivalStartInfo: FestivalStartInfo | null; // 축제 진입 순간 "이제부터 K턴마다 N회!" 규칙 안내 배너
  commentary: CommentaryLine[];
  captions: CaptionItem[];
  emoticons: PlayerEmoticon[];
  placeFocusBursts: PlaceFocusItem[];
  drawSlots: DrawSlotItem[];
  woolBalls: WoolBallItem[];
  acornBalls: AcornBallItem[]; // 도토리 축제 랜덤 뽑기 — 보드 중앙에서 장소로 날아가는 도토리
  festivalLoaded: FestivalLoaded | null; // "도토리 축제 효과! 랜덤 뽑기 N회!" 예고 배너
  collectingCardIds: ReadonlySet<number>; // 수집되어 날아가는 중이라 아직 화면에 남겨야 하는 카드
  shakingPile: ShakingPile | null; // 정산 직전 "확인" 흔들림이 재생 중인 동물 스택
  newCardId: number | null; // 방금 스택에 추가된 카드 (팝인 강조용)
  stackCards: Record<Animal, StackedCard[]>; // 화면에 실제로 그려야 하는 카드 목록(연출 타이밍 반영, id 오름차순)
  displayedActiveTeam: Team; // 정산 연출이 끝나야 실제 activeTeam으로 갱신되는 "화면상" 활성 팀
  displayedActivePlayerIndex: number;
  isSettling: boolean; // 이번 액션의 정산 연출이 아직 재생 중인지
  decisiveHit: { winner: Team } | null; // 체력 즉시 승패를 만든 그 행동 — "결정타!" 강조용
}

const EMPTY_SCORE_MAP = new Map<string, number>() as ReadonlyMap<string, number>;
const EMPTY_HP_PULSE_MAP = new Map<Team, HpPulse>() as ReadonlyMap<Team, HpPulse>;
const EMPTY_ID_SET = new Set<number>() as ReadonlySet<number>;

const EMPTY_GAP = 80;
const SCORE_FLASH_DUR = 500;
const HP_PULSE_DUR = 700;
const EFFECT_DUR = 1200;
const COMMENTARY_MAX = 40;
const SHEEP_COMBO_DUR = 1400;
const SHAKE_PULSE_DUR = 300;
// 화면 흔들림 레벨(GameLayout의 shakeScale이 이 숫자로 진폭을 계산한다) — 두 가지 용도로 쓴다:
// 1) 실용신양/도토리 축제 예약 뽑기 롤에 "처음 진입"하는 순간 한 번(약하게).
// 2) 동물 스택이 쌓일 때마다(뽑기 종류 무관) 그 크기 기준으로(4장↑ 약하게, 6장↑ 강하게).
const SCREEN_SHAKE_WEAK = 1;
const SCREEN_SHAKE_STRONG = 4;
const STACK_SHAKE_WEAK_AT = 4;
const STACK_SHAKE_STRONG_AT = 6;
const MAIN_COMBO_DUR = 1300;
const REACTION_DUR = 700;
const COLLECT_FLING_DUR = 450; // .stack-card-fling-* CSS 지속시간과 일치해야 함 — 원래 750ms의 60%(페어 카드가 팀 쪽으로 날아가는 연출만 단축)
const SHAKE_CHECK_DUR = 550; // .stack-card-shake-* CSS 지속시간과 일치해야 함
const SHEEP_LOADED_DUR = 1100;
const EMOTICON_DUR = 2000;
const TIGER_RECOIL_DUR = 500;
const TIGER_HIT_DUR = 900;
const MERMAID_POPUP_DUR = 2000;
const RABBIT_FLIGHT_DUR = 1100; // 최대 출발 지연(400ms) + 비행 애니메이션(650ms)보다 여유 있게
const RABBIT_PRESSURE_DUR = 700;
const FESTIVAL_BURST_DUR = 2000;
const FESTIVAL_START_INFO_DUR = 2600; // "이제부터 K턴마다 N회!" 규칙 안내 배너 — 두 줄이라 다른 배너보다 조금 더 오래 보여준다
const DECISIVE_HIT_DUR = 1800;
// ── 결정타를 맞은 팀의 좌절 연출 ───────────────────────────────────────────
const DESPAIR_LEAD_MS = 300;  // 화면이 흔들린 직후 첫 마리가 뜨기까지
const DESPAIR_STEP_MS = 240;  // 네 마리가 "주루룩" 이어서 뜨는 간격
const DESPAIR_ENTER_MS = 900; // globals.css의 emoticonEnter 길이와 일치해야 한다
// 네 마리가 다 뜬 뒤, 종료 화면으로 넘어가기 전에 그 망연자실한 얼굴을 보여주는 여운.
// 이 이모티콘들은 스스로 사라지지 않으므로(persist), 여기까지 계속 떠 있는다.
const DESPAIR_LINGER_MS = 800;

let floatIdCounter = 0;

export function useAnimationQueue(
  lastEvents: ClientGameEvent[],
  gameState: ClientGameState | null,
): AnimationState {
  const [screenShakeLevel, setScreenShakeLevel] = useState(0);
  const [leafParticleCount, setLeafParticleCount] = useState(0);
  const [floatingTexts, setFloatingTexts] = useState<FloatingTextItem[]>([]);
  const [sheepCombos, setSheepCombos] = useState<SheepCombo[]>([]);
  const [mainCombo, setMainCombo] = useState<MainCombo | null>(null);
  const [sheepLoaded, setSheepLoaded] = useState<SheepLoaded | null>(null);
  const [sheepProgress, setSheepProgress] = useState<SheepProgress | null>(null);
  const [festivalProgress, setFestivalProgress] = useState<FestivalProgress | null>(null);
  const [rabbitFlights, setRabbitFlights] = useState<RabbitFlight[]>([]);
  const [rabbitPressure, setRabbitPressure] = useState<RabbitPressure | null>(null);
  const [tigerSlash, setTigerSlash] = useState<{ onTeam: Team } | null>(null);
  const [tigerRecoil, setTigerRecoil] = useState<{ attackerTeam: Team } | null>(null);
  const [tigerImpact, setTigerImpact] = useState(false);
  const [mermaidPopup, setMermaidPopup] = useState<{ team: Team } | null>(null);
  const [scoreFlash, setScoreFlash] = useState<ReadonlyMap<string, number>>(EMPTY_SCORE_MAP);
  const [hpPulse, setHpPulse] = useState<ReadonlyMap<Team, HpPulse>>(EMPTY_HP_PULSE_MAP);
  const [festivalFlash, setFestivalFlash] = useState(false);
  const [festivalBurst, setFestivalBurst] = useState(false);
  const [festivalStartInfo, setFestivalStartInfo] = useState<FestivalStartInfo | null>(null);
  const [commentary, setCommentary] = useState<CommentaryLine[]>([]);
  const [captions, setCaptions] = useState<CaptionItem[]>([]);
  const [emoticons, setEmoticons] = useState<PlayerEmoticon[]>([]);
  const [placeFocusBursts, setPlaceFocusBursts] = useState<PlaceFocusItem[]>([]);
  const [drawSlots, setDrawSlots] = useState<DrawSlotItem[]>([]);
  const [woolBalls, setWoolBalls] = useState<WoolBallItem[]>([]);
  const [acornBalls, setAcornBalls] = useState<AcornBallItem[]>([]);
  const [festivalLoaded, setFestivalLoaded] = useState<FestivalLoaded | null>(null);
  const [collectingCardIds, setCollectingCardIds] = useState<ReadonlySet<number>>(EMPTY_ID_SET);
  const [shakingPile, setShakingPile] = useState<ShakingPile | null>(null);
  const [newCardId, setNewCardId] = useState<number | null>(null);
  const [decisiveHit, setDecisiveHit] = useState<{ winner: Team } | null>(null);
  // 실제 서버 경험치(gameState.teams[t].exp)는 페어가 맞는 즉시 반영되지만, 화면에는 그
  // 페어 카드가 팀 쪽으로 날아가 도착하는 순간에야 숫자가 오르는 게 더 직관적이다.
  //
  // "표시값을 따로 누적해서 매 이벤트마다 +/-로 갱신"하는 방식은 한 번 시도했다가
  // 실전 버그로 이어졌다: 상대(특히 컴퓨터)가 애니메이션 타임라인이 끝나기 전에 다음
  // 액션을 연달아 두면, 매 액션 처음에 이전 타이머를 통째로 취소하는 로직 때문에 아직
  // 반영되지 않은 "+경험치" 예약이 통째로 사라져버렸다. 그 뒤 다른 행동(예: 양을 두 번
  // 씀)으로 경험치를 깎으면, 반영된 적 없는 +를 깎게 되어 표시 경험치가 실제로는 있을 수
  // 없는 음수(-10 등)까지 내려가는 버그가 났다.
  //
  // 그래서 지금은 델타를 누적하지 않는다 — 서버가 보내주는 gameState.exp(항상 정답)에서
  // "아직 도착 연출이 끝나지 않은 페어의 exp만큼" 그때그때 가려서 보여주는 스냅샷 방식을
  // 쓴다. 다음 액션이 도착하면 무조건 먼저 그 가림을 전부 걷어(=최신 진실 그대로 노출)
  // 시작하므로, 타이머가 취소되어도 절대 실제보다 낮아지거나 음수가 될 수 없다.
  const [pendingExpCredit, setPendingExpCredit] = useState<Record<string, number>>({});
  // "화면에 지금 그려야 하는 카드"를 실제 서버 진실(gameState.stacks)과 분리해서 관리한다.
  // 서버는 액션이 끝나는 즉시 최종 상태(수집으로 카드가 사라진 상태)를 보내오지만,
  // 화면에는 "등장 → (짝 맞으면) 흔들기 → 날아가기" 연출이 끝난 뒤에야 사라지도록,
  // id를 여기서 직접 관리한다.
  const [revealedCardIds, setRevealedCardIds] = useState<ReadonlySet<number>>(EMPTY_ID_SET);
  const cardCacheRef = useRef<Map<number, StackedCard>>(new Map());

  // 실제 서버 상태(gameState.activeTeam)는 액션 처리 즉시 다음 팀으로 넘어가지만,
  // 화면에는 이번 액션의 정산 연출이 완전히 끝날 때까지 "행동한 팀"을 그대로 유지해
  // 보여준다 — 정산 도중 배경/테두리 색이 성급하게 바뀌어 혼란을 주지 않기 위함.
  const [displayedActiveTeam, setDisplayedActiveTeam] = useState<Team>(gameState?.activeTeam ?? 'A');
  const [displayedActivePlayerIndex, setDisplayedActivePlayerIndex] = useState<number>(gameState?.activePlayerIndex ?? 0);
  const [isSettling, setIsSettling] = useState(false);
  // 이번 액션의 정산이 끝나면 화면 턴을 어디로 넘겨야 하는지 미리 기록해둔다. 싱글 모드처럼
  // 상대(컴퓨터)가 아주 빠르게 다음 수를 두면, 이 턴 전환이 실행되기도 전에 다음 액션이
  // 도착해 타이머가 통째로 취소될 수 있다 — 그러면 상대 턴 배경색이 한 번도 안 보이고
  // 곧바로 내 턴으로 되돌아온 것처럼 보인다. 다음 액션이 도착한 렌더 도중(아래
  // lastEventsForCreditRef 블록)에 이 값을 반드시 반영하고 넘어간다.
  const pendingFlipRef = useRef<{ team: Team; playerIndex: number } | null>(null);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // 다음 액션이 들어올 때 timersRef를 통째로 비우기 때문에, 그보다 오래 지속되는
  // 이모티콘 등의 "제거" 타이머는 여기 따로 담아 언마운트 시에만 정리한다.
  const persistentTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => persistentTimersRef.current.forEach(clearTimeout), []);

  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // ⚠️ exp 마스킹은 useLayoutEffect가 아니라 렌더 도중에 동기적으로 적용한다.
  // useLayoutEffect로 하면(예전 방식) "gameState는 이미 갱신됐지만 pendingExpCredit는
  // 아직 예전 값"인 첫 번째 렌더가 일단 커밋까지 끝나고, 그 직후 레이아웃 이펙트가
  // 두 번째(가려진) 렌더로 덮어씌우는 두 번의 커밋이 생긴다. 화면에는 두 번째 커밋만
  // 페인트되어 눈으로는 문제가 없어 보이지만, 첫 번째(부풀려진) 커밋에도 하위 컴포넌트의
  // useEffect(예: ScorePanel의 레벨업 감지)가 정상적으로 예약되고, 이 이펙트는 두 번째
  // 커밋이 이미 화면을 바로잡았다는 사실과 무관하게 자신이 렌더될 때 캡처한 "부풀려진"
  // level 값을 그대로 들고 나중에(패시브 이펙트라 비동기로) 실행돼버린다 — 그 결과
  // 카드가 실제로 도착하기도 전에 "Lv UP!" 연출이 클릭 즉시 터지고, prevLevelRef까지
  // 잘못된 값으로 어긋나 정작 진짜 도착 시점의 레벨업은 감지되지 않는 버그로 이어졌다.
  // 렌더 "중에" 상태를 보정하면(React가 공식 지원하는 패턴) 그 부풀려진 첫 번째 커밋 자체가
  // 아예 생기지 않으므로, 어떤 하위 이펙트도 잘못된 값을 관측할 기회가 없다.
  // (개발 원칙: 애니메이션과 실제 로직의 순서가 항상 일치해야 한다 — 카드 뽑기 → 동물
  // 영역으로 도착 → 경험치 반영 → 정산해서 레벨업. CLAUDE.md 참고.)
  const lastEventsForCreditRef = useRef<ClientGameEvent[] | null>(null);
  if (lastEvents !== lastEventsForCreditRef.current) {
    lastEventsForCreditRef.current = lastEvents;

    // 이전 액션의 턴 전환이 아직 실행되지 못한 채 이번 액션이 도착했다면, 아래 레이아웃
    // 이펙트가 타이머를 통째로 취소하기 전에 그 전환을 여기서 먼저 반영한다. 예전에는
    // 이펙트 안에서 flushSync로 밀어넣었는데, 레이아웃 이펙트는 이미 커밋 단계라
    // "flushSync was called from inside a lifecycle method" 경고가 났다. exp 마스킹과
    // 똑같이 렌더 도중 동기 보정으로 옮기면 경고 없이 같은 목적을 달성한다 —
    // 오히려 한 단계 더 이르게, 새 gameState와 같은 커밋에 반영된다.
    if (lastEvents.length > 0 && pendingFlipRef.current) {
      const { team, playerIndex } = pendingFlipRef.current;
      pendingFlipRef.current = null;
      setDisplayedActiveTeam(team);
      setDisplayedActivePlayerIndex(playerIndex);
    }

    const newCredits: Record<string, number> = {};
    lastEvents.forEach(ev => {
      if (ev.type === 'collect') {
        const key = deltaKeyOf(ev.team, ev.animal);
        newCredits[key] = (newCredits[key] ?? 0) + ev.exp;
      }
    });
    setPendingExpCredit(newCredits);
  }

  // lastEvents가 비어있는 gameState 갱신(최초 입장 · 재접속 스냅샷)은 재생할 애니메이션이
  // 없으므로, 이미 존재하는 카드들을 슬롯머신 연출 없이 즉시 스택에 그대로 노출시킨다.
  // (actionResult로 들어오는 갱신은 항상 최소 1개 이상의 이벤트를 동반하므로 여기 걸리지 않는다.)
  useEffect(() => {
    if (!gameState || lastEvents.length > 0) return;
    ANIMALS.forEach(a => {
      gameState.stacks[a].forEach(c => cardCacheRef.current.set(c.id, c));
    });
    setRevealedCardIds(prev => {
      let changed = false;
      const next = new Set(prev);
      ANIMALS.forEach(a => {
        gameState.stacks[a].forEach(c => {
          // 이미 수집이 끝난(획득 기록으로만 남은) 카드는 다시 노출시키지 않는다.
          if (c.collectedBy === null && !next.has(c.id)) {
            next.add(c.id);
            changed = true;
          }
        });
      });
      return changed ? next : prev;
    });
    setDisplayedActiveTeam(gameState.activeTeam);
    setDisplayedActivePlayerIndex(gameState.activePlayerIndex);
    setIsSettling(false);
    setPendingExpCredit({});
  }, [gameState, lastEvents]);

  const sched = (fn: () => void, delayMs: number) => {
    const t = setTimeout(fn, delayMs);
    timersRef.current.push(t);
  };

  const schedPersistent = (fn: () => void, delayMs: number) => {
    const t = setTimeout(fn, delayMs);
    persistentTimersRef.current.push(t);
  };

  const addFloat = (text: string, team: Team, type: 'bonus' | 'penalty') => {
    const id = ++floatIdCounter;
    setFloatingTexts(prev => [...prev, { id, text, team, type }]);
    sched(() => setFloatingTexts(prev => prev.filter(f => f.id !== id)), 1200);
  };

  const pulseHp = (team: Team, direction: 'gain' | 'loss') => {
    const id = ++floatIdCounter;
    setHpPulse(prev => new Map([...prev, [team, { id, direction }]]));
    sched(() => {
      setHpPulse(prev => {
        const next = new Map(prev);
        if (next.get(team)?.id === id) next.delete(team);
        return next;
      });
    }, HP_PULSE_DUR);
  };

  const CAPTION_DUR: Record<CaptionItem['tier'], number> = { pair: 800, effect: 950 };
  const addCaption = (
    text: string,
    tier: CaptionItem['tier'],
    atMs: number,
    opts?: { placeKey?: Place; stackAnimal?: Animal; anchorCardId?: number; team?: Team; durationOverride?: number },
  ) => {
    const id = ++floatIdCounter;
    const { durationOverride, ...rest } = opts ?? {};
    const duration = durationOverride ?? CAPTION_DUR[tier];
    sched(() => {
      setCaptions(prev => [...prev, { id, text, tier, ...rest }]);
      sched(() => setCaptions(prev => prev.filter(c => c.id !== id)), duration);
    }, atMs);
  };

  /**
   * persist를 주면 제거 타이머를 아예 걸지 않는다 — 게임 종료 좌절 연출은 저절로
   * 사라지지 않고, 화면이 종료 화면으로 넘어갈 때 GameLayout과 함께 사라진다.
   * (그때까지 남은 것들은 새 액션이 도착하면 위 리셋 블록이 직접 걷어낸다.)
   */
  const addEmoticon = (
    team: Team,
    playerIndex: number,
    file: string,
    atMs: number,
    opts?: { persist?: boolean },
  ) => {
    const id = ++floatIdCounter;
    const persist = opts?.persist ?? false;
    sched(() => {
      setEmoticons(prev => [...prev, { id, team, playerIndex, file, persist }]);
      if (!persist) {
        schedPersistent(() => setEmoticons(prev => prev.filter(e => e.id !== id)), EMOTICON_DUR);
      }
    }, atMs);
  };

  const PLACE_FOCUS_DUR = 480;
  const addPlaceFocus = (place: Place, atMs: number) => {
    const id = ++floatIdCounter;
    sched(() => {
      setPlaceFocusBursts(prev => [...prev, { id, place }]);
      schedPersistent(() => setPlaceFocusBursts(prev => prev.filter(f => f.id !== id)), PLACE_FOCUS_DUR);
    }, atMs);
  };

  // exp 가림(pendingExpCredit)도, 미반영 턴 전환(pendingFlipRef)도 이제 이 이펙트보다
  // 먼저(렌더 도중, 위쪽 lastEventsForCreditRef 블록) 동기 반영되므로 이 이펙트 자체는
  // useEffect로도 충분하다 — 다만 이미 문제없이 검증된 useLayoutEffect를 그대로
  // 유지한다(불필요한 위험 회피).
  // (개발 원칙: 애니메이션과 실제 로직의 순서가 항상 일치해야 한다 — 카드 뽑기 →
  // 동물 영역으로 도착 → 경험치 반영 → 정산해서 레벨업. CLAUDE.md 참고.)
  useLayoutEffect(() => {
    if (lastEvents.length === 0) return;

    // (이전 액션의 미반영 턴 전환은 위쪽 lastEventsForCreditRef 블록에서 이미 렌더 도중
    //  동기 반영됐다 — 여기서 다시 건드리지 않는다.)

    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    // ── 이전 액션이 "켜놓고 나중에 끄기"로 예약해둔 연출들을 강제로 정리한다 ──
    // 위에서 timersRef를 통째로 취소했기 때문에, 이전 액션이 예약해둔 "일정 시간
    // 후 끄기/제거" 콜백들도 함께 사라진다. 새 액션이 도착했다는 것 자체가 서버
    // 기준으로는 이전 액션이 이미 완전히 끝났다는 뜻이므로(특히 빠르게 다음 수를
    // 두는 컴퓨터 상대), 켜진 채로 방치되면 화면에 영원히 남는 연출들을 여기서
    // 전부 끈다. 반대로 emoticons/placeFocusBursts/sheepLoaded는 schedPersistent로
    // 이미 timersRef 취소의 영향을 받지 않도록 설계되어 있으므로 건드리지 않는다.
    // 단 하나의 예외가 persist 이모티콘(게임 종료 좌절 연출)이다 — 제거 타이머 자체가
    // 없어서, 새 액션이 와도 그냥 두면 화면에 영영 남는다. 여기서 직접 걷어낸다.
    setEmoticons(prev => (prev.some(e => e.persist) ? prev.filter(e => !e.persist) : prev));
    setScreenShakeLevel(0);
    setLeafParticleCount(0);
    setFloatingTexts([]);
    setSheepCombos([]);
    setMainCombo(null);
    setSheepProgress(null);
    setFestivalProgress(null);
    setRabbitFlights([]);
    setRabbitPressure(null);
    setTigerSlash(null);
    setTigerRecoil(null);
    setTigerImpact(false);
    setMermaidPopup(null);
    setScoreFlash(EMPTY_SCORE_MAP);
    setHpPulse(EMPTY_HP_PULSE_MAP);
    setFestivalFlash(false);
    setFestivalBurst(false);
    setFestivalStartInfo(null);
    setCaptions([]);
    setDrawSlots([]);
    setWoolBalls([]);
    setAcornBalls([]);
    setShakingPile(null);
    setNewCardId(null);
    setDecisiveHit(null);
    // pendingExpCredit는 이제 이 이펙트가 아니라 렌더 도중(위쪽 lastEventsForCreditRef
    // 블록)에 이미 이번 액션의 정답값으로 동기 반영돼 있다 — 여기서 다시 건드리지 않는다.

    // 이번 액션의 정산 연출이 끝날 때까지는 화면상 "행동한 팀"의 턴으로 유지한다.
    setIsSettling(true);

    const gameState = gameStateRef.current;

    // ── 카드 원본 캐시 갱신 + 정산/취소 잔재 정리 ───────────────────────────
    // 서버는 액션이 끝나는 즉시 최종 상태(수집으로 카드가 사라진 상태)를 보내오지만,
    // 화면에는 "등장 → 흔들기 → 날아가기" 연출이 끝난 뒤에야 반영되어야 한다. 그런데
    // 바로 위에서 이전 액션의 타이머를 전부 취소했기 때문에, 이전 액션의 연출이 채
    // 끝나기 전에 새 액션이 도착하면 두 방향의 문제가 생길 수 있었다: (1) 아직 등장
    // 못한 카드가 영원히 투명한 채로 남거나, (2) 이미 수집됐어야 할 카드가 날아가기
    // 연출이 취소된 채 정지 화면으로 계속 남는 것. 여기서 캐시를 최신화하고 두 경우를
    // 모두 즉시 바로잡은 뒤 이번 액션을 시작한다.
    if (gameState) {
      ANIMALS.forEach(a => {
        gameState.stacks[a].forEach(c => cardCacheRef.current.set(c.id, c));
      });

      const thisActionDrawIds = new Set(
        lastEvents.filter((e): e is Extract<ClientGameEvent, { type: 'draw' }> => e.type === 'draw')
          .map(e => e.card.id),
      );
      const thisActionCollectIds = new Set(
        lastEvents
          .filter((e): e is Extract<ClientGameEvent, { type: 'collect' }> => e.type === 'collect')
          .flatMap(e => e.cardIds),
      );

      setRevealedCardIds(prev => {
        let changed = false;
        const next = new Set(prev);

        // (1) 아직 못 보여준 채로 남아있던 미획득 카드를 즉시 노출한다.
        ANIMALS.forEach(a => {
          gameState.stacks[a].forEach(c => {
            if (c.collectedBy === null && !next.has(c.id) && !thisActionDrawIds.has(c.id)) {
              next.add(c.id);
              changed = true;
            }
          });
        });

        // (2) 이미 수집됐어야 하는데 취소되어 계속 보이던 카드를 즉시 치운다.
        next.forEach(id => {
          if (thisActionDrawIds.has(id) || thisActionCollectIds.has(id)) return;
          const cached = cardCacheRef.current.get(id);
          if (!cached) return;
          const stillOnBoard = gameState.stacks[cached.animal].some(c => c.id === id);
          if (cached.collectedBy !== null || !stillOnBoard) {
            next.delete(id);
            changed = true;
          }
        });

        return changed ? next : prev;
      });

      setCollectingCardIds(prev => (prev.size === 0 ? prev : EMPTY_ID_SET));
    }

    // ── Pass 0: 해설판 커멘터리 생성 (즉시 반영, 통합 로그) ─────────────────
    if (gameState) {
      // A팀/B팀이 아니라 방 생성 시 입력한 실제 팀 이름을 그대로 쓴다. 뒤에 "팀"을
      // 덧붙이면 이미 "팀"으로 끝나는 이름이 "개발팀팀"처럼 겹쳐 보인다.
      const teamLabel = (t: Team) => `[${gameState.teamNames[t]}]`;

      const newLines: { team: Team | null; text: string }[] = [];
      lastEvents.forEach(ev => {
        if (ev.type === 'collect') {
          // 동물 이름은 넣지 않는다 — 이모지가 이미 그 동물을 가리키는데 바로 뒤에
          // 이름까지 또 적으면("🐰 상표토끼") 같은 것을 두 번 말하는 것처럼 보인다.
          newLines.push({
            team: ev.team,
            text: `${teamLabel(ev.team)} ${ANIMAL_INFO[ev.animal].emoji} 경험치 +${ev.exp}!`,
          });
        } else if (ev.type === 'bonusDraws') {
          newLines.push({
            team: ev.team,
            text: `${teamLabel(ev.team)} 예약된 카드 ${ev.count}장 뽑기!`,
          });
        } else if (ev.type === 'festivalDraws') {
          newLines.push({
            team: ev.team,
            text: `${teamLabel(ev.team)} 🌰 도토리 축제 효과! 랜덤 뽑기 ${ev.count}회!`,
          });
        } else if (ev.type === 'skillApplied' && ev.level > 0) {
          const parts: string[] = [
            `${teamLabel(ev.team)} ${ANIMAL_INFO[ev.animal].emoji} ${randomActionPhrase(ev.animal)}`,
          ];
          if (ev.animal === 'mermaid') {
            parts.push(`다음 행동 ×${ev.multiplierAfter}배로!`);
          } else {
            if (ev.myHpDelta > 0) parts.push(`체력 +${ev.myHpDelta}`);
            if (ev.oppHpDelta < 0) parts.push(`상대 체력 ${ev.oppHpDelta}`);
            if (ev.extraDrawsQueued > 0) parts.push(`다음 턴 추가 뽑기 ${ev.extraDrawsQueued}회 예약`);
          }
          newLines.push({ team: ev.team, text: parts.join(' ') });
        } else if (ev.type === 'skillPassed' && !ev.auto) {
          newLines.push({ team: ev.team, text: `${teamLabel(ev.team)} 다음 기회를 노리기로 했습니다.` });
        } else if (ev.type === 'festival') {
          newLines.push({ team: null, text: '🌰 도토리 축제 시작!!' });
        } else if (ev.type === 'timeoutChoice') {
          newLines.push({
            team: null,
            text: ev.animal
              ? `시간 초과로 서버가 대신 ${ANIMAL_INFO[ev.animal].name} 행동을 선택했습니다.`
              : '시간 초과로 아무 행동도 선택되지 않아 턴이 넘어갔습니다.',
          });
        } else if (ev.type === 'gameEnd') {
          const reasonText = ev.reason === 'knockout' ? '체력 승부 GAME OVER!' : '제한 턴 종료 — 체력 비교';
          newLines.push({
            team: null,
            text: ev.winner === 'draw' ? `무승부! (${reasonText})` : `${teamLabel(ev.winner)} 승리! (${reasonText})`,
          });
        }
      });

      if (newLines.length > 0) {
        setCommentary(prev => {
          const appended = [
            ...prev,
            ...newLines.map(line => ({ id: ++floatIdCounter, text: line.text, team: line.team })),
          ];
          return appended.slice(-COMMENTARY_MAX);
        });
      }
    }

    // ── Pass 1: 뽑기(draw) + 예약된 추가 뽑기(bonusDraws=실용신양, festivalDraws=도토리 축제) 애니메이션 ────────
    // 도토리 축제 랜덤 뽑기는 실용신양과 완전히 동일한 방식(장소 클릭 시 예약분을 먼저
    // 소모)으로 동작한다(server/engine/drawCard.ts) — 한 액션 안에서 bonusDraws(실용신양)가
    // 먼저, 그 다음 festivalDraws(도토리 축제)가 소모되므로 두 롤이 동시에 진행 중일 수는 없다.
    let cursor = 0;
    let bonusRollTeam: Team | null = null;
    let bonusRollRemaining = 0;
    let bonusRollIdx = 0;
    let bonusRollTotal = 0;
    let festivalRollTeam: Team | null = null;
    let festivalRollRemaining = 0;
    let festivalRollIdx = 0;
    let festivalRollTotal = 0;
    let comboCounter = 0;
    let lastDrawEndCursor = 0;

    // ── 카드가 쌓일 때마다(뽑기 종류·롤 여부와 무관하게) 화면을 흔들기 위한 준비 ──
    // 이번 액션에서 각 동물 스택이 몇 장째가 되는지 실시간으로 추적한다. 시작값(baseline)은
    // "이번 액션이 끝난 뒤의 최종 상태"에서 이번 액션에 새로 뽑힌 장수만큼을 거꾸로 빼서
    // 구한다 — 정산(collect)이 있었다면 그 페어에 포함된 카드 수(cardIds.length, 정산
    // 직후 0장으로 리셋되기 전의 총량)를, 없었다면 지금 gameState에 남아있는 미획득
    // 장수를 최종값으로 삼는다.
    const drawCountByAnimal: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
    const collectedCountByAnimal: Partial<Record<Animal, number>> = {};
    lastEvents.forEach(e => {
      if (e.type === 'draw') drawCountByAnimal[e.card.animal]++;
      else if (e.type === 'collect') collectedCountByAnimal[e.animal] = e.cardIds.length;
    });
    const stackRunningCount: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
    ANIMALS.forEach(a => {
      const finalUncollected = gameState ? gameState.stacks[a].filter(c => c.collectedBy === null).length : 0;
      const totalAtEnd = collectedCountByAnimal[a] ?? finalUncollected;
      stackRunningCount[a] = totalAtEnd - drawCountByAnimal[a];
    });
    // 같은 액션 안에서 카드가 여러 장 연달아 쌓여도(롤 중 등), 흔들림은 각 단계(약함/
    // 강함)에 "새로 진입하는 그 순간"에만 한 번씩 재생한다 — 임계값을 넘은 채로 계속
    // 쌓일 때마다 매번 흔들면 다시 "애매하게 잦은 흔들림"이 되어버리기 때문이다.
    const shookTierByAnimal: Partial<Record<Animal, 'weak' | 'strong'>> = {};

    for (const ev of lastEvents) {
      if (ev.type === 'draw') {
        const inFestivalRoll = festivalRollRemaining > 0;
        const inSheepRoll = !inFestivalRoll && bonusRollRemaining > 0;
        const inRoll = inFestivalRoll || inSheepRoll;
        const triggerAt = cursor;
        let rollIdx = 0;

        if (inFestivalRoll) {
          festivalRollRemaining--;
          festivalRollIdx++;
          rollIdx = festivalRollIdx;
          const team = festivalRollTeam!;
          const place = ev.place;
          const ballId = ++floatIdCounter;
          sched(() => {
            setAcornBalls(prev => [...prev, { id: ballId, team, place }]);
            sched(() => setAcornBalls(prev => prev.filter(b => b.id !== ballId)), WOOL_BALL_DUR);
          }, triggerAt);
        } else if (inSheepRoll) {
          bonusRollRemaining--;
          bonusRollIdx++;
          rollIdx = bonusRollIdx;
          const team = bonusRollTeam!;
          const place = ev.place;
          const ballId = ++floatIdCounter;
          sched(() => {
            setWoolBalls(prev => [...prev, { id: ballId, team, place }]);
            sched(() => setWoolBalls(prev => prev.filter(b => b.id !== ballId)), WOOL_BALL_DUR);
          }, triggerAt);
        }

        const slotAt = inRoll ? triggerAt + WOOL_BALL_DUR : triggerAt;
        const revealAt = slotAt + SLOT_SPIN_DUR;
        const drawEndsAt = slotAt + SLOT_TOTAL_DUR;
        const card = ev.card;
        const place = ev.place;

        // 카드가 쌓일수록(뽑기 종류 무관) 화면을 흔든다 — 4장 이상 약하게, 6장 이상
        // 강하게. 단, 매 장마다가 아니라 그 단계에 "새로 진입하는" 순간에만 한 번
        // 재생한다(예: 5장→6장으로 강한 단계에 올라설 때만 다시 흔들리고, 6장→7장은
        // 이미 강한 단계라 흔들지 않는다). 카드가 실제로 등장하는(revealAt) 순간에
        // 맞춰 재생한다.
        stackRunningCount[card.animal]++;
        const pileSize = stackRunningCount[card.animal];
        const pileTier: 'weak' | 'strong' | null =
          pileSize >= STACK_SHAKE_STRONG_AT ? 'strong' : pileSize >= STACK_SHAKE_WEAK_AT ? 'weak' : null;
        if (pileTier !== null && pileTier !== shookTierByAnimal[card.animal]) {
          shookTierByAnimal[card.animal] = pileTier;
          const pileShakeLevel = pileTier === 'strong' ? SCREEN_SHAKE_STRONG : SCREEN_SHAKE_WEAK;
          sched(() => {
            setScreenShakeLevel(pileShakeLevel);
            sched(() => setScreenShakeLevel(0), SHAKE_PULSE_DUR);
          }, revealAt);
        }

        const slotId = ++floatIdCounter;
        sched(() => {
          setDrawSlots(prev => [...prev, { id: slotId, place, animal: card.animal, num: card.num }]);
          sched(() => setDrawSlots(prev => prev.filter(s => s.id !== slotId)), SLOT_TOTAL_DUR);
        }, slotAt);

        addPlaceFocus(place, slotAt);

        // 슬롯이 뜨고 0.3초 뒤에 card_1/card_2 사운드를 재생한다(스핀 종료까지는 기다리지 않음).
        const pitch = inRoll ? Math.min(1.35, 1 + (rollIdx - 1) * 0.035) : 1;
        sched(() => playRandomSound('card', pitch), slotAt + 300);

        sched(() => {
          setNewCardId(card.id);
          setRevealedCardIds(prev => (prev.has(card.id) ? prev : new Set(prev).add(card.id)));
          sched(() => setNewCardId(prev => (prev === card.id ? null : prev)), REACTION_DUR);
        }, drawEndsAt - 120);

        if (inRoll) {
          const combo = ++comboCounter;
          const comboId = ++floatIdCounter;
          const progressTeam = inFestivalRoll ? festivalRollTeam : bonusRollTeam;
          const progressCurrent = inFestivalRoll ? festivalRollIdx : bonusRollIdx;
          const progressTotal = inFestivalRoll ? festivalRollTotal : bonusRollTotal;
          sched(() => {
            setSheepCombos(prev => [...prev, { id: comboId, place, combo }]);
            sched(() => setSheepCombos(prev => prev.filter(c => c.id !== comboId)), SHEEP_COMBO_DUR);

            // 이번 턴에 예약된 추가 뽑기가 몇 번째까지 진행됐는지 계속 갱신해 보여준다
            // (실용신양/도토리 축제 각각 자기 진행 배지에만 반영한다).
            if (inSheepRoll) {
              setSheepProgress({ team: progressTeam!, current: progressCurrent, total: progressTotal });
            } else if (inFestivalRoll) {
              setFestivalProgress({ team: progressTeam!, current: progressCurrent, total: progressTotal });
            }
          }, revealAt);

          const rollFinished = inFestivalRoll ? festivalRollRemaining === 0 : bonusRollRemaining === 0;
          if (rollFinished) {
            const finalId = ++floatIdCounter;
            sched(() => {
              setMainCombo({ id: finalId, combo });
              sched(() => setMainCombo(null), MAIN_COMBO_DUR);
            }, revealAt);
          }
        }

        lastDrawEndCursor = Math.max(lastDrawEndCursor, drawEndsAt);
        cursor = inRoll ? triggerAt + SHEEP_DRAW_STEP : drawEndsAt + EMPTY_GAP;
        continue;
      }

      if (ev.type === 'bonusDraws') {
        bonusRollTeam = ev.team;
        bonusRollRemaining = ev.count;
        bonusRollIdx = 0;
        bonusRollTotal = ev.count;

        // 예약 뽑기 롤에 처음 진입하는 순간 화면을 약하게 한 번 흔든다 — 뽑을 때마다
        // 점점 세게 흔들던 이전 방식은 타이밍이 애매하다는 피드백으로 폐지하고,
        // "진입 시 1회"로 단순화했다(카드가 실제로 쌓일 때의 흔들림은 별도).
        sched(() => {
          setScreenShakeLevel(SCREEN_SHAKE_WEAK);
          sched(() => setScreenShakeLevel(0), SHAKE_PULSE_DUR);
        }, cursor);

        if (ev.count >= 5) {
          const level = ev.count;
          sched(() => {
            setLeafParticleCount(level >= 12 ? 8 : 4);
            sched(() => setLeafParticleCount(0), 3000);
          }, cursor);
        }

        // "예약된 카드 N장 뽑기!" — 지난 턴 실용신양 행동으로 예약해둔 뽑기가 지금 소모됨을 예고한다.
        {
          const loadedId = ++floatIdCounter;
          const team = ev.team;
          const count = ev.count;
          sched(() => {
            setSheepLoaded({ id: loadedId, team, count });
            schedPersistent(() => {
              setSheepLoaded(prev => (prev?.id === loadedId ? null : prev));
            }, SHEEP_LOADED_DUR);
          }, cursor);
        }
        continue;
      }

      if (ev.type === 'festivalDraws') {
        festivalRollTeam = ev.team;
        festivalRollRemaining = ev.count;
        festivalRollIdx = 0;
        festivalRollTotal = ev.count;

        // 실용신양 롤과 동일하게, 처음 진입하는 순간 화면을 약하게 한 번 흔든다.
        sched(() => {
          setScreenShakeLevel(SCREEN_SHAKE_WEAK);
          sched(() => setScreenShakeLevel(0), SHAKE_PULSE_DUR);
        }, cursor);

        // 한 액션에 실용신양 롤과 도토리 축제 롤이 함께 들어있으면(둘 다 예약돼 있던 경우)
        // 이 시점엔 실용신양 롤이 이미 끝나 있다(server/engine/drawCard.ts 순서상 항상
        // 실용신양이 먼저) — 완료된 "N/N" 배지가 도토리 배지와 같은 자리에 겹쳐 남지
        // 않도록 여기서 지운다.
        sched(() => setSheepProgress(null), cursor);

        if (ev.count >= 5) {
          const level = ev.count;
          sched(() => {
            setLeafParticleCount(level >= 12 ? 8 : 4);
            sched(() => setLeafParticleCount(0), 3000);
          }, cursor);
        }

        // "도토리 축제 효과! 랜덤 뽑기 N회!" — 축제로 예약해둔 뽑기가 지금 소모됨을 예고한다.
        {
          const loadedId = ++floatIdCounter;
          const count = ev.count;
          sched(() => {
            setFestivalLoaded({ id: loadedId, count });
            schedPersistent(() => {
              setFestivalLoaded(prev => (prev?.id === loadedId ? null : prev));
            }, SHEEP_LOADED_DUR);
          }, cursor);
        }
        continue;
      }
    }

    // ── Pass 1.5: 짝이 맞아 정산되는 동물들을 순서대로 재생 ─────────────────
    // 서버는 sheep→rabbit→mermaid→tiger 순으로 정산하지만, 화면에는 항상
    // 양→토끼→호랑이→인어 순으로 보여주고, 각 정산 사이엔 이전 정산의 애니메이션이
    // 끝난 직후 바로 이어지도록 짧은 여백만 둔다. 이번 액션에서 짝이 맞지 않은
    // 동물은 건너뛴다.
    {
      type CollectEvent = Extract<ClientGameEvent, { type: 'collect' }>;
      const collectEvents = lastEvents.filter((e): e is CollectEvent => e.type === 'collect');

      const SETTLE_ORDER: Animal[] = ['sheep', 'rabbit', 'tiger', 'mermaid'];
      const SETTLE_GAP = 150;

      const groups = SETTLE_ORDER.map(animal => ({
        animal,
        events: collectEvents.filter(e => e.animal === animal),
      }));

      cursor = Math.max(cursor, lastDrawEndCursor + EMPTY_GAP);
      let hasPlayedGroup = false;

      for (const group of groups) {
        if (group.events.length === 0) continue;
        if (hasPlayedGroup) cursor += SETTLE_GAP;
        hasPlayedGroup = true;

        for (const ev of group.events) {
          const { team, animal, exp, cardIds } = ev;
          const flashKey = `${team}:${animal}`;
          const flashId = ++floatIdCounter;
          const at = cursor;
          const shakeId = ++floatIdCounter;

          addCaption(`${ANIMAL_INFO[animal].short} 페어!`, 'pair', at, {
            stackAnimal: animal,
            anchorCardId: cardIds[cardIds.length - 1],
          });

          // 서버 exp에는 이 페어의 exp가 이미 반영돼 있다 — 카드가 실제로 도착할 때까지는
          // 그만큼을 화면에서 가려서 보여준다. 이 가림(exp 크레딧)은 렌더 도중(위쪽
          // lastEventsForCreditRef 블록)에 이미 동기적으로 걸려 있으므로 여기서는 다시
          // 걸지 않는다 — 아래에서는 도착 시점에 그 가림을 걷는 것만 담당한다.

          // 1) 카드가 스택에 다 모인 뒤, 짝이 맞았는지 "확인하듯" 스택 전체가 흔들린다.
          sched(() => {
            setShakingPile({ id: shakeId, animal });
            sched(() => setShakingPile(prev => (prev?.id === shakeId ? null : prev)), SHAKE_CHECK_DUR);
          }, at);

          // 2) 흔들기가 끝난 뒤에야 팀 쪽으로 날아가기 시작한다.
          const flingAt = at + SHAKE_CHECK_DUR;
          sched(() => {
            setCollectingCardIds(prev => new Set([...prev, ...cardIds]));
          }, flingAt);

          // 3) 날아가기까지 완전히 끝나 카드가 팀 칸에 도착한 뒤에야 — 스택에서 완전히
          // 제거하고, 팀 패널 숫자도 이제서야 올리고(경험치 반영이 카드가 실제로 도착하는
          // 순간과 맞아떨어지도록), 팝 강조도 이때 함께 재생한다.
          sched(() => {
            setCollectingCardIds(prev => {
              const next = new Set(prev);
              cardIds.forEach(id => next.delete(id));
              return next;
            });
            setRevealedCardIds(prev => {
              const next = new Set(prev);
              cardIds.forEach(id => next.delete(id));
              return next;
            });
            setPendingExpCredit(prev => {
              if (!(flashKey in prev)) return prev;
              const next = { ...prev };
              delete next[flashKey];
              return next;
            });
            setScoreFlash(prev => new Map([...prev, [flashKey, flashId]]));
            sched(() => {
              setScoreFlash(prev => {
                const next = new Map(prev);
                if (next.get(flashKey) === flashId) next.delete(flashKey);
                return next;
              });
            }, SCORE_FLASH_DUR);
          }, flingAt + COLLECT_FLING_DUR);

          cursor = flingAt + COLLECT_FLING_DUR + 80;
        }
      }
    }

    // ── Pass 1.6: 행동 발동(skillApplied) — 정산과는 별개 액션(선택 응답)에서 온다.
    // 동물마다 원래 있었던 전용 연출을 그대로 재생한다. "다음 기회를 노리기"(수동 패스,
    // skillPassed)는 더 이상 큰 캡션으로 알리지 않는다 — 스킬을 안 썼을 때는 화면에
    // 아무것도 안 뜨는 편이 낫다는 판단(해설판 로그 줄만 남는다).
    {
      const skillEv = lastEvents.find((e): e is Extract<ClientGameEvent, { type: 'skillApplied' }> => e.type === 'skillApplied');

      if (skillEv && skillEv.level > 0) {
        const { team, animal, myHpDelta, oppHpDelta, multiplierAfter, extraDrawsQueued } = skillEv;
        const opp: Team = team === 'A' ? 'B' : 'A';
        const at = cursor;

        // 큰 캡션은 이제 캐치프레이즈("실용신양의 힘!" 류) 대신, 스킬 선택 패널
        // (SkillChoiceBar)의 노란 글씨와 같은 내용을 그대로 보여준다 — "무슨 효과인지"를
        // 바로 알 수 있게 하기 위함. SkillChoiceBar의 effectParts 조합과 반드시 같은
        // 문구를 써야 한다(다른 곳에서 문구를 바꾸면 여기도 맞춰야 함).
        const effectParts: string[] = [];
        if (extraDrawsQueued > 0) effectParts.push(`다음 턴 카드 +${extraDrawsQueued}회`);
        if (myHpDelta > 0) effectParts.push(`내 체력 +${myHpDelta}`);
        if (oppHpDelta < 0) effectParts.push(`상대 체력 ${oppHpDelta}`);
        if (animal === 'mermaid') effectParts.push(`다음 행동 ×${multiplierAfter}`);
        addCaption(effectParts.join(', '), 'effect', at, { team });

        sched(() => {
          const gs = gameStateRef.current;
          if (gs) {
            addEmoticon(team, gs.teams[team].playerIndex, emoticonFile(animal, 'happy'), at);
          }

          if (animal === 'rabbit') {
            // 상표토끼 — 보드 여기저기서 토끼떼가 우르르 체력 구슬로 달려가는 연출
            playRandomSound('rabbit');
            if (myHpDelta > 0) {
              pulseHp(team, 'gain');
              const flightId = ++floatIdCounter;
              setRabbitFlights(prev => [...prev, { id: flightId, team }]);
              sched(() => setRabbitFlights(prev => prev.filter(f => f.id !== flightId)), RABBIT_FLIGHT_DUR);
              addFloat(`+${myHpDelta}`, team, 'bonus');

              setRabbitPressure({ sourceTeam: team, targetTeam: opp });
              sched(() => setRabbitPressure(null), RABBIT_PRESSURE_DUR);
            }
          } else if (animal === 'mermaid') {
            // 디자인어 — 큰 인어 팝업. 즉시 체력 변화는 없고 다음 행동의 배율만 키운다.
            playRandomSound('mermaid');
            setMermaidPopup({ team });
            sched(() => setMermaidPopup(null), MERMAID_POPUP_DUR);
            addFloat(`×${multiplierAfter}`, team, 'bonus');
          } else if (animal === 'tiger') {
            // 특허랑이 — 공격자 반동 + 피격자 슬래시/비네트, 양쪽 체력 구슬이 동시에 움직인다.
            setTigerRecoil({ attackerTeam: team });
            sched(() => setTigerRecoil(null), TIGER_RECOIL_DUR);
            sched(() => {
              setTigerSlash({ onTeam: opp });
              setTigerImpact(true);
              setScreenShakeLevel(2); // 발톱자국이 슉 그어지는 순간 화면이 짧게 흔들린다
              playRandomSound('tiger');
              sched(() => setTigerSlash(null), TIGER_HIT_DUR);
              sched(() => setTigerImpact(false), 600);
              sched(() => setScreenShakeLevel(0), SHAKE_PULSE_DUR);
              if (oppHpDelta < 0) {
                pulseHp(opp, 'loss');
                if (myHpDelta > 0) pulseHp(team, 'gain');
                addFloat(`${oppHpDelta}`, opp, 'penalty');
              }
            }, TIGER_RECOIL_DUR);
          } else {
            // 실용신양 — 즉시 체력 변화는 없지만, "메~"를 한 번만 틀면 임팩트가 약해서
            // 2~3번 랜덤으로 이어 틀어 존재감을 키운다.
            playRandomSoundSequence('sheep', 2 + Math.floor(Math.random() * 2), 180, 'card');
          }
        }, at);

        cursor = animal === 'tiger'
          ? at + TIGER_RECOIL_DUR + TIGER_HIT_DUR + 80
          : at + EFFECT_DUR;
      }
    }

    // ── festival은 턴 전환 이벤트라 위 재생이 모두 끝난 뒤에 이어 재생한다. ────
    const festivalEv = lastEvents.find(e => e.type === 'festival');
    if (festivalEv) {
      const at = cursor;
      sched(() => {
        setFestivalFlash(true);
        setFestivalBurst(true);
        playRandomSoundSequence('bomb', 3);
        sched(() => setFestivalFlash(false), 600);
        sched(() => setFestivalBurst(false), FESTIVAL_BURST_DUR);

        // "이제부터 K턴마다 N회!" — 이 방에 실제로 적용되는 규칙(방장이 정한 설정값)을
        // 그대로 보여준다. 참고용 상수가 아니라 항상 gameState.settings에서 읽는다.
        if (gameState) {
          const infoId = ++floatIdCounter;
          setFestivalStartInfo({
            id: infoId,
            drawCount: gameState.settings.festivalDrawCount,
            increaseInterval: gameState.settings.festivalDrawIncreaseInterval,
          });
          sched(() => setFestivalStartInfo(prev => (prev?.id === infoId ? null : prev)), FESTIVAL_START_INFO_DUR);
        }
      }, at);
      cursor = at + 900;
    }

    // ── 체력 즉시 승패(gameEnd, reason=knockout)는 마지막에 "결정타!" 강조와 함께 재생한다. ──
    const gameEndEv = lastEvents.find((e): e is Extract<ClientGameEvent, { type: 'gameEnd' }> => e.type === 'gameEnd');
    if (gameEndEv && gameEndEv.reason === 'knockout' && gameEndEv.winner !== 'draw') {
      const at = cursor;
      const winner = gameEndEv.winner;
      const loser: Team = winner === 'A' ? 'B' : 'A';
      sched(() => {
        setScreenShakeLevel(3);
        sched(() => setScreenShakeLevel(0), SHAKE_PULSE_DUR);
        setDecisiveHit({ winner });
        sched(() => setDecisiveHit(null), DECISIVE_HIT_DUR);
      }, at);

      // 진 팀 프로필 옆으로 네 동물이 차례차례 좌절하는 얼굴을 띄운다 — 결정타 한 방에
      // 무너졌다는 게 한눈에 보이도록. 겹치지 않게 아래로 한 칸씩 쭈루룩 쌓인다.
      // 다른 이모티콘과 달리 persist라 저절로 사라지지 않는다 — 이긴 쪽이 그 망연자실한
      // 네 얼굴을 그대로 보면서 종료 화면으로 넘어가도록.
      // 앵커는 진 팀의 현재 차례 플레이어(방금 수를 둔 건 이긴 쪽이다). 게임이 이미
      // 끝나 이 값이 더 바뀌지 않으므로, gameStateRef 대신 이 이펙트의 gameState를 쓴다.
      const loserPlayerIndex = gameState?.teams[loser].playerIndex ?? 0;
      ANIMALS.forEach((animal, i) => {
        addEmoticon(
          loser,
          loserPlayerIndex,
          emoticonFile(animal, randomDespairMood()),
          at + DESPAIR_LEAD_MS + i * DESPAIR_STEP_MS,
          { persist: true },
        );
      });

      // 마지막 한 마리가 다 뜨고 여운까지 지나기 전에는 종료 화면으로 넘어가지 않는다.
      const despairEndsAt =
        DESPAIR_LEAD_MS + (ANIMALS.length - 1) * DESPAIR_STEP_MS + DESPAIR_ENTER_MS + DESPAIR_LINGER_MS;
      cursor = at + Math.max(DECISIVE_HIT_DUR, despairEndsAt);
    }

    // ── 정산 연출이 여기서 끝난다 — 이 시점에야 비로소 화면상의 턴을 실제 서버 상태로 넘긴다. ──
    if (gameState) {
      pendingFlipRef.current = { team: gameState.activeTeam, playerIndex: gameState.activePlayerIndex };
    }
    sched(() => {
      setIsSettling(false);
      const latest = gameStateRef.current;
      if (latest) {
        setDisplayedActiveTeam(latest.activeTeam);
        setDisplayedActivePlayerIndex(latest.activePlayerIndex);
      }
      pendingFlipRef.current = null;
      // 턴이 실제로 넘어가는 이 시점에는 "방금 맞았다/공격했다" 류의 일회성 타격
      // 연출이 전부 걷혀 있어야 한다 — 각자 자기 타이머로도 지워지지만, 혹시라도
      // 늦게 남아있는 게 있다면 여기서 확실하게 마무리한다.
      setTigerSlash(null);
      setTigerRecoil(null);
      setTigerImpact(false);
      setRabbitPressure(null);
      setHpPulse(EMPTY_HP_PULSE_MAP);
    }, cursor);

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvents]);

  // (이전에는 여기서 "게임이 phase:'ended'로 바뀌면 isSettling이 이미 false일 때 남은
  // 타이머를 정리"하는 이펙트가 있었다. 하지만 gameState와 lastEvents는 같은 커밋에서
  // 함께 갱신되므로, 그 이펙트가 읽는 isSettling은 "이번 커밋에서 위 메인 이펙트가 막
  // setIsSettling(true)로 바꾸려는 값"이 아니라 "그 전 렌더의(대개 false인) 값"이었다 —
  // 즉 knockout으로 게임이 끝나는 바로 그 순간 이 이펙트가 방금 예약된 결정타 타임라인의
  // 타이머까지 통째로 지워버려, isSettling이 다시는 false로 내려가지 않고 화면이
  // GameLayout에 멈춰버리는 레이스 컨디션이 있었다(사운드만 바뀌고 결과 화면이 안 뜨는
  // 버그의 원인). 재접속으로 이미 끝난 게임에 들어오는 경우는 위쪽의 "lastEvents가 빈
  // 상태 갱신" 이펙트가 isSettling(false)을 직접 세팅해 처리하므로, 이 별도 정리
  // 이펙트는 애초에 불필요했다 — 제거한다.

  // 실제로 화면에 그릴 카드 목록 — revealedCardIds에 있는 카드만, id(=뽑힌 순서)
  // 오름차순으로 정렬해 동물별로 묶는다. 원본 데이터는 gameState가 아니라
  // cardCacheRef에서 가져온다.
  const stackCards = useMemo(() => {
    const result: Record<Animal, StackedCard[]> = { sheep: [], rabbit: [], mermaid: [], tiger: [] };
    const ids = [...revealedCardIds].sort((a, b) => a - b);
    for (const id of ids) {
      const c = cardCacheRef.current.get(id);
      if (c) result[c.animal].push(c);
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealedCardIds]);

  // 팀 패널에 실제로 보여줄 경험치 — 항상 서버 진실(gameState.exp)에서 "아직 도착 연출이
  // 끝나지 않은 페어"만큼만 빼서 보여준다(위 pendingExpCredit 설명 참조).
  const displayedExp = useMemo(() => {
    const zero: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
    const result: Record<Team, Record<Animal, number>> = { A: { ...zero }, B: { ...zero } };
    if (!gameState) return result;
    (['A', 'B'] as const).forEach(team => {
      ANIMALS.forEach(animal => {
        const credit = pendingExpCredit[`${team}:${animal}`] ?? 0;
        result[team][animal] = gameState.teams[team].exp[animal] - credit;
      });
    });
    return result;
  }, [gameState, pendingExpCredit]);

  return {
    screenShakeLevel,
    leafParticleCount,
    floatingTexts,
    sheepCombos,
    mainCombo,
    sheepLoaded,
    sheepProgress,
    festivalProgress,
    rabbitFlights,
    rabbitPressure,
    tigerSlash,
    tigerRecoil,
    tigerImpact,
    mermaidPopup,
    scoreFlash,
    displayedExp,
    hpPulse,
    festivalFlash,
    festivalBurst,
    festivalStartInfo,
    commentary,
    captions,
    emoticons,
    placeFocusBursts,
    drawSlots,
    woolBalls,
    acornBalls,
    festivalLoaded,
    collectingCardIds,
    shakingPile,
    newCardId,
    stackCards,
    displayedActiveTeam,
    displayedActivePlayerIndex,
    isSettling,
    decisiveHit,
  };
}
