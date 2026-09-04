# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

**한국특허정보원 카드배틀** — 맵 네 모서리 장소에서 카드를 뽑아 중앙 동물 스택에 쌓고, 짝수 장이 모이는 순간 획득하는 할리갈리/고스톱류 실시간 N:N 팀 대전 웹 게임. 4대 지식재산권(실용신안·상표·디자인·특허)을 의인화한 아기 동물 카드 4종(🐑실용신양·🐰상표토끼·🧜‍♀️디자인어·🐯특허랑이)이 등장한다.

게임 규칙(장소별 확률, 스킬 공식, 턴 흐름)은 `README.md`가 최신 기준이다. `ROADMAP.md`는 초기 설계 문서로 이후 대개편(6×6 보드 → 장소 클릭 방식, 자동발동 효과 → 턴종료 스킬 선택제 등)을 거쳐 실제 코드와 달라진 부분이 많으니 참고만 할 것 — 정확한 수치는 항상 `shared/constants.ts`·`shared/types.ts`와 실제 코드를 확인한다.

## 기술 스택 & 모노레포 구조

npm workspaces (`client`, `server`, `shared`) — 루트 `package.json`에는 실행 스크립트가 없고, 각 워크스페이스 디렉토리에서 직접 명령을 실행한다.

- **`shared/`** — 타입(`types.ts`)·상수(`constants.ts`)·WebSocket 프로토콜(`protocol.ts`), `index.ts`에서 재export. 클라이언트·서버 양쪽에서 `shared` 패키지명으로 import(서버는 jest `moduleNameMapper`, 클라이언트는 workspace 심링크로 해석).
- **`server/`** — Node.js + `ws` WebSocket 서버. TypeScript를 `ts-node`로 직접 실행(별도 컴파일 없이 개발).
- **`client/`** — Next.js (App Router) + TypeScript + Tailwind CSS v4. `client/AGENTS.md`가 명시하듯 이 Next.js는 표준판과 다른 브레이킹 체인지가 있을 수 있으니, 확신이 없으면 `node_modules/next/dist/docs/`를 먼저 확인할 것.

## 개발 명령어

```bash
# 서버 (WebSocket, 기본 포트 8080)
cd server
npm run dev             # ts-node index.ts 직접 실행
npm test                # jest — server/__tests__/**/*.test.ts (규칙 단위 테스트 + 봇 시뮬레이션)
npm test -- effects     # 단일 파일만 (testMatch 패턴에 걸리는 이름 일부로 필터)
npm run test:sim        # 봇 500게임 시뮬레이션 (밸런스 검증, testTimeout 60s)
npx ts-node scripts/balanceAnalysis.ts [게임수]   # 그리디 봇 기준 스킬별 기여도 분석
npx ts-node scripts/skillBalanceSuite.ts [게임수] # 여러 봇 전략 조합 종합 밸런스 리포트(md 파일로도 저장)

# 클라이언트 (Next.js, 기본 포트 3000)
cd client
npm run dev
npm run build
```

두 서버(WS 8080 + Next 3000)를 각각 별도 터미널로 띄워야 브라우저에서 실제 플레이가 가능하다. 클라이언트가 바라보는 WS 주소는 `NEXT_PUBLIC_WS_URL`(기본 `ws://localhost:8080`)로 바꿀 수 있다. lint 스크립트/설정은 아직 없다.

## 핵심 아키텍처

### 서버가 유일한 진실(Source of Truth)
카드는 뽑히는 즉시 공개되므로(숨김 정보 없음) `GameState`를 거의 그대로 클라이언트에 보낸다(`server/serializer.ts`가 `activePlayerNickname`/`turnRemainingMs`/`turnTotalMs`/`teamNames`/`memberIds`만 덧붙임). 모든 랜덤(뽑히는 동물/숫자, 실용신양 추가 뽑기 장소, 시간초과 시 대신 고르는 선택)은 서버에서만 생성된다. 30초(설정 가능) 턴 타이머는 서버가 `Room.turnDeadline`으로 관리하고, 클라이언트 타이머는 표시 전용이다.

**턴 타이머를 화면에 그리는 규칙 3가지** — 이 셋 중 하나만 어겨도 "설정한 시간과 다른 숫자에서 시작하거나, 0에 멈춰 있는데 턴은 계속 흐르는" 증상이 된다.
1. **절대 시각을 보내지 않는다.** 서버 시계의 `Date.now()`를 그대로 보내면 클라이언트 PC 시계가 어긋난 만큼 표시가 통째로 틀어진다(배포 환경에서 특히). 서버는 직렬화 순간 기준 **남은 ms**(`turnRemainingMs`)를 보내고, `useWebSocket`이 **받은 그 순간에** 자기 시계로 데드라인을 환산한다(타이머 컴포넌트가 마운트될 때 환산하면 연출 대기 시간이 통째로 사라진다).
2. **게이지 폭은 클라이언트가 짐작하지 않는다.** 실제 제한시간은 방 설정값에 예약 뽑기 연장(`SHEEP_EXTRA_TIME_PER_DRAW_SEC`)이나 "고를 행동이 없을 때"의 단축이 섞여 있다. 서버가 `turnTotalMs`로 알려주고 클라이언트는 그대로 쓴다.
3. **연출 시간은 제한시간에서 깎지 않는다.** 서버는 액션 처리 즉시 타이머를 걸지만 플레이어는 연출이 끝나야 조작할 수 있으므로, `Room.settleGraceMs(events)`가 그 액션의 연출 길이를 추정해 `turnTotalMs` 위에 유예로 얹는다. 유예 구간에는 남은 시간이 `turnTotalMs`를 넘는데, `TurnTimer`가 `turnTotalMs`로 잘라 표시하므로 화면에는 "설정값 그대로 가득 찬 게이지"로 보인다.

### 게임 엔진 3계층 (server/engine/, UI와 완전 분리 — 순수 함수 + 단위 테스트 대상)
1. **`gameEngine.ts`** — 외부에서 부르는 진입점. `processPlayerAction`(장소 클릭 → 뽑기+정산) → `processSkillChoice`/`processPass`(턴 종료 시 행동 선택) 2단계 흐름. `processTimeout`이 두 대기 상태 모두를 대신 처리(장소 대기 중이면 무작위 장소, 행동 대기 중이면 무작위 유효 행동 또는 자동 패스).
2. **`drawCard.ts`** — 실용신양으로 예약된 추가 뽑기(`pendingExtraDraws`, `SHEEP_SAFETY_CAP`까지) 소모 → 클릭한 장소에서 1장 뽑기 → 동물별 미획득 스택이 짝수면 한 번에 정산(`settleStacks`). 정산은 경험치만 올리고 체력은 건드리지 않는다.
3. **`skills.ts`** / **`turnManager.ts`** — `skills.ts`는 레벨(`floor(exp/threshold)`) 기반 4행동 효과 계산과 경험치 소모, `turnManager.ts`는 턴/팀 교대, 축제(`festivalTurn`) 진입, `MAX_TURN` 초과·즉시 승패(체력 knockout) 판정, 그리고 `initGame`.

**시작 공유 카드** — `initGame`은 빈 보드가 아니라 `dealOpeningSharedCards`(`engine/places.ts`)로 뽑은 **서로 다른 동물 2장**(숫자 `OPENING_SHARED_CARD_NUM_MIN~MAX` = 7~13)을 중앙 스택에 깔고 시작한다. 빈 보드에서는 선 플레이어가 무엇을 뽑아도 짝이 되지 않고 그 짝을 바로 다음 차례인 상대가 가져가는 구조적 불리함이 있어서다. **두 장이 반드시 다른 동물이어야 한다**는 게 이 규칙의 핵심 — 같은 동물이면 선 플레이어가 첫 클릭도 하기 전에 그 자리에서 정산되어 취지가 뒤집힌다. 스택을 한 장 단위로 통제해야 하는 테스트는 `effects.test.ts`의 `clearStacks`로 이 두 장을 걷어내고 시작한다.

**행동(스킬) 규칙 요약** — 행동을 고르면 그 동물의 경험치는 `레벨 × threshold`만큼만 차감(초과분은 다음 레벨을 위해 유지)되고, 효과로 얻은 값은 절대 경험치로 되돌아가지 않는다(경험치·체력은 완전히 분리된 자원). `pendingMultiplier`는 디자인어(인어)를 쓸 때마다 그 발동의 레벨만큼 더해진다(`pendingMultiplier += 레벨` — 곱연산이 아니라 합연산. "다음 행동이 레벨만큼 더 발동한다"는 뜻이고, 기본값 1이 "기본 1회"에 해당해 최종 배율은 항상 `1 + 누적 레벨`이다). 인어 외의 행동을 쓰면 사용 직후 1로 초기화된다.

| 동물 | threshold | 효과 |
|---|---|---|
| sheep(실용신양) | 10 | 다음 내 턴에 `레벨×배율`회 추가 뽑기 예약(`pendingExtraDraws`) |
| rabbit(상표토끼) | 10 | 내 체력 `+레벨×배율` |
| mermaid(디자인어) | 20 | `pendingMultiplier += 레벨`(자기 자신은 배율 미소모, 합연산으로 누적) |
| tiger(특허랑이) | 20 | 상대 체력에서 `레벨×배율`만큼 강탈(보존형 — 상대가 가진 만큼만, 오버킬 없음) |

### 방(Room) 상태 머신 — `server/room.ts`
방 하나 = `Room` 인스턴스 하나. 로비(플레이어 join/ready → 방장이 `startGame`) → `initGame`으로 `GameState` 생성 → 이후 모든 WS 메시지(`drawCard`/`chooseSkill`/`passSkill`)를 검증(현재 턴/대기 상태와 일치하는 플레이어인지)한 뒤 `gameEngine` 진입점을 호출하고 결과를 브로드캐스트하는 흐름.

**방장(host)** — 방을 만든 사람이 `hostPlayerId`가 되고, 로비에서만 쓸 수 있는 명령(`movePlayer`/`kickPlayer`/`transferHost`/`setTeamName`/`updateSettings`/`startGame`)을 갖는다. 모든 명령은 `requireHost`가 "게임 시작 전인지 + 방장인지"를 함께 검사한다(`movePlayer`만 예외 — 자기 자신을 옮길 때는 누구나 가능). 방장이 로비에서 빠지면 `removePlayer`가 남아 있는 첫 번째 사람에게 자리를 넘긴다 — 안 그러면 아무도 `startGame`을 부를 수 없어 방이 통째로 멈춘다. 이전에는 전원이 ready가 되는 순간 자동으로 시작했지만, 지금은 방장이 명시적으로 시작 버튼을 눌러야 한다(방장 본인은 ready 개념이 없어 항상 `ready: true`).

**관전자(제3의 자리)** — 로비에서 고르는 "자리"는 `Seat = Team | 'spectator'`(`shared/types.ts`)이고, **게임 엔진에는 관전석이 존재하지 않는다**(`Team`은 여전히 `'A'|'B'` 둘뿐 — 정산·턴 교대·승패가 전부 두 팀을 전제로 짜여 있으니 엔진 타입에 `'spectator'`를 섞지 말 것). 관전자는 `Room`의 `teamPlayerIds.spectator`에만 담기므로 `memberIds`에도 실리지 않고, 그 결과 `expectedPlayerId` 비교에 절대 걸리지 않는다(그래도 이유가 분명한 에러를 주려고 `rejectIfSpectator`가 세 조작 핸들러 앞을 막는다). 관전자는 **인원수에도 준비 상태에도 영향을 주지 않는다** — `ready`는 항상 true로 고정(`setReady`가 관전자를 무시)이고, 시작 조건은 "양 팀에 한 명 이상 + 전원 준비"뿐이라 관전자만 늘어나도 시작이 막히지 않는다. 관전석↔팀 이동 시 `movePlayer`가 `ready`를 다시 맞춘다. 이 규칙들은 `server/__tests__/spectator.test.ts`가 지킨다.

클라이언트에서는 **`myTeam === null`이 곧 "관전 시점"**이다(대기실에서 `sessionStorage.cardBattle_team`에 `'spectator'`가 저장되면 게임 화면이 A/B 어느 쪽도 아니라고 판단해 null로 남긴다). 이 한 값으로 화면 전체가 갈린다: 팀 색이 "우리 연두/상대 붉은"에서 중립 두 색으로 바뀌고(팔레트는 **`client/lib/teamColors.ts` 한 곳** — 기본 민트·핑크이고 CSS 변수 `--spec-*`로만 소비되므로 색을 바꾸려면 이 파일만 고친다), 조작은 전부 막히며, 대신 지금 차례인 팀 색의 반투명 👇 가이드(`GuideFinger`)가 양 팀 차례 모두에 뜬다. **새로 팀 색을 쓰는 UI를 추가할 때는 `myTeam === null` 분기를 빠뜨리지 말 것** — 빠뜨리면 관전자에게 양 팀이 모두 "상대팀(붉은색)"으로 보인다(실제로 자막·결과 화면에서 그 버그가 있었다).

**이름은 항상 채워져 있다** — 닉네임과 팀 이름의 무작위 생성은 `shared/names.ts`(`randomNickname`/`randomTeamName`) 한 곳에 있고 클라이언트·서버가 같이 쓴다. **팀 이름에 "미정(null)" 상태를 되살리지 말 것** — `addPlayer`는 방을 만드는 순간 양 팀 이름을 모두 확정하고(방장이 상대 팀 이름을 비워뒀으면 무작위), `setTeamName`에 빈 이름이 오면 미정으로 되돌리는 게 아니라 무작위로 다시 뽑는다. 예전엔 "그 팀에 실제로 참가하는 사람이 직접 정할 기회"를 남기려고 비워뒀지만 참가 화면에는 팀 이름 입력칸이 아예 없어서, 대기실에 "팀 2 (미정)"만 남는 버그로만 드러났다. 서버는 닉네임도 `normalizeNickname`으로 다시 정리한다(길이 컷 + 빈 이름이면 무작위) — 클라이언트 검증만 믿지 않는다. 양 팀 이름이 같아지는 경로는 `setTeamName`·`startBlockReason`·클라이언트 방 만들기 화면 세 곳에서 함께 막는다(게임에 들어가면 두 팀을 가리는 단서가 이름뿐이다).

**대기실 채팅** — `Room.chatLog`는 `CHAT_HISTORY_MAX`(50)개짜리 링 버퍼이고, 사람이 친 말(`kind: 'chat'`)과 방에서 일어난 일(`kind: 'system'`, `pushSystem`)이 한 줄기로 섞여 있다. 게임 화면에는 채팅이 없다 — `handleChat`은 `started`면 곧바로 return하고, 클라이언트도 `gameStart`에서 `chatLog`를 비운다. 과속·빈 메시지는 **에러를 보내지 않고 조용히 버린다**(실사용자는 클라이언트 쪽 억제에 먼저 걸리므로 빨간 배너는 소음일 뿐이다).

주의할 순서 두 가지 — 어기면 곧바로 눈에 보이는 버그가 된다.
1. `addPlayer`는 `sendChatHistory` → `pushSystem('… 들어왔어요')` 순서여야 한다. 뒤바뀌면 새로 들어온 사람이 자기 입장 줄을 `chatMessage`로 한 번, `chatHistory`로 또 한 번 받아 두 줄로 보인다(클라이언트의 id 비교 방어선이 있지만 그 방어선에 기대지 말 것).
2. `removePlayer(playerId, reason)`는 퇴장 안내 → 방장 승계 안내 순으로 push하고, 둘 다 `players.size === 0 → onEmpty()` 검사 **앞**에 와야 한다. `reason`은 자진 퇴장·연결 끊김(`'left'`)과 추방(`'kicked'`)의 문구를 가른다.

**`memberId` vs `playerId`** — `playerId`(UUID)는 사실상 재접속 자격증명이라(`handleReconnect`가 이 값만으로 통과시킨다) 로비 목록에 실으면 남의 세션을 가로챌 수 있다. 그래서 방장 명령의 대상 지정과 로비 목록에는 방 안에서만 통하는 짧은 공개 식별자 `memberId`(`m1`, `m2`, …)를 쓰고, `playerId`는 오직 그 소유자에게만 `roomCreated`/`roomJoined`로 보낸다. 새 로비 기능을 추가할 때도 이 구분을 유지할 것. 턴 타이머(`resetTimer`)는 대기 상태(장소 선택 vs 행동 선택)에 따라 `settings.drawTimeSec`/`actionTimeSec`을 쓰고, 실용신양 예약 뽑기 수만큼 `SHEEP_EXTRA_TIME_PER_DRAW_SEC`를 더 준다. 싱글 모드(`addSoloPlayer`)는 B팀을 CPU로 채우고 `performComputerAction`이 일정 딜레이 후 무작위(또는 즉시 승리 가능한 수 우선) 행동을 대신 수행한다. 그 딜레이는 두 대기 상태가 서로 다르다 — 장소 선택은 처리 시각부터 `CPU_THINK_*`(2.2~3.2초)를 그대로 세지만, **행동 선택은 반드시 `settleGraceMs(직전 이벤트)`를 먼저 얹은 뒤** `CPU_SKILL_THINK_*`(1~1.5초)를 센다. 서버는 뽑기를 처리하는 즉시 `pendingChoice`를 세우는 반면 화면에는 슬롯·정산 연출이 다 끝나야 [행동 선택] 단계가 뜨므로, 이 유예를 빼면 컴퓨터가 연출 도중에 골라버려 그 단계가 통째로 없는 것처럼 보인다. 재접속은 `sessionStorage`에 저장된 `playerId`로 `reconnect` 메시지를 보내 `gameSnapshot`을 다시 받는 방식.

`RoomManager`(`server/roomManager.ts`)는 4글자 방 코드(`O`/`I` 제외)로 `Room` 인스턴스를 생성·조회·정리하는 순수 관리 계층이고, `createConnectionHandler`(`server/gameServer.ts`)가 `ClientMessage` 타입별 분기(WS 연결 하나당 `currentRoomId`/`currentPlayerId` 클로저 유지)를 맡는다. 이 핸들러를 분리해둔 이유는 독립 실행(`server/index.ts`, 로컬 개발용 8080 포트에 자체 `WebSocketServer` 생성)과 통합 실행(루트 `server.ts`, Next.js와 같은 포트를 쓰는 배포용) 양쪽이 동일한 연결 처리 로직을 공유하기 위해서다.

### 배포 — 루트 `server.ts` / `Dockerfile`
Render처럼 서비스당 포트를 하나만 외부로 공개하는 플랫폼에서는 WS용 포트를 따로 열 수 없으므로(브라우저가 WS 서버에 직접 접속하는 구조라, 그 포트가 공개되지 않으면 접속 자체가 안 됨), 루트 `server.ts`가 Next.js 커스텀 서버 위에 같은 HTTP 서버·같은 포트(`$PORT`, 기본 3000)로 `/ws` 경로의 WebSocket을 함께 띄운다. 로컬 개발 시에는 이 파일을 쓰지 않는다 — 위의 "개발 명령어"대로 서버(8080)와 클라이언트(3000)를 분리 실행하는 방식을 그대로 쓴다. `npm run start`(루트, `ts-node --transpile-only server.ts`) 또는 `docker build -t ip-card-battle .` && `docker run -p 3000:3000 ip-card-battle`로 실행하며, 외부 도메인에 배포할 때는 `NEXT_PUBLIC_WS_URL`을 빌드 시점(`--build-arg`, Next.js `NEXT_PUBLIC_*`는 빌드 타임에 고정)에 `wss://<호스트>/ws` 형태로 넣어야 한다.

### 방장이 정하는 게임 규칙 (`GameSettings`, `shared/constants.ts`)
`targetScore`(시작 체력이자 승리 격차 — winHp = targetScore×2), `festivalTurn`(도토리 축제 시작 턴), `festivalDrawCount`/`festivalDrawIncreaseInterval`, `drawTimeSec`/`actionTimeSec`/`noActionTimeSec`. 방 생성 시 `clampSettings`로 `SETTINGS_LIMITS` 범위로 잘라내며, 게임 중에는 불변이다. 실제 승패 판정·타이머 계산은 항상 `state.settings`를 참조하고, `shared/constants.ts`의 `INITIAL_HP`/`WIN_HP`/`FESTIVAL_TURN` 등은 "기본 규칙일 때의 참고값"일 뿐이다.

**도토리 축제** — `festivalTurn`(기본 8턴)에 도달하면 그 턴부터 **매 턴 계속(한 번 터지고 끝나는 일회성 보너스가 아니다)** 다음 팀에게 실용신양과 동일한 방식의 "도토리 뽑기"가 예약된다(`pendingFestivalDraws`, `server/engine/turnManager.ts`의 `festivalDrawCountAt`). 매 턴 같은 횟수가 아니라 `festivalDrawIncreaseInterval`(k, 기본 2턴)이 지날 때마다 그 턴부터 매 턴 예약되는 횟수 자체가 `n×1 → n×2 → n×3 ...`로 한 단계씩 올라간다 — 기본 설정 그대로도 2턴마다 계속 단계가 오른다(k를 999에 가깝게 크게 잡아야 비로소 "사실상 증가 없음"이 된다). 이 규칙을 다시 바꿀 때는 "한 번만 터지는 이벤트"로 오해해 되돌리기 쉬우니 주의. 축제 진입 순간, 클라이언트는 그 방에 실제 적용되는 k·n 값을 `FestivalStartBanner`로 화면 중앙에 안내한다(`useAnimationQueue.ts`의 `festivalStartInfo`).

### 클라이언트 — 서버 이벤트를 연출 타임라인으로 번역
서버는 매 액션마다 `GameEvent[]`(draw/collect/bonusDraws/festivalDraws/skillApplied/skillPassed/festival/gameEnd/timeout* 등)와 최신 `GameState`를 함께 보낸다. `client/hooks/useAnimationQueue.ts`가 이 이벤트 배열을 받아 **연출 순서대로 재생 시각을 계산해 `setTimeout` 체인으로 스케줄링**하는 것이 클라이언트에서 가장 복잡하고 중요한 부분이다 — 실제 게임 상태(`gameState`)는 액션이 끝나는 즉시 최종값으로 도착하지만, 화면에는 "슬롯 스핀 → 카드 노출 → (짝 맞으면) 흔들기 → 팀 쪽으로 날아가기 → 팀 패널 숫자 반영 → 레벨업 판정" 순서로 지연 재생되어야 하므로, 카드 목록(`stackCards`)·경험치 표시값(`displayedExp`)·활성 팀 표시(`displayedActiveTeam`) 모두 서버 진실과 별도의 "화면상 상태"로 관리한다. 다음 액션이 이전 애니메이션 도중 도착하면 타이머를 통째로 취소하고 서버 진실 기준으로 강제 정리하는 방어 로직이 곳곳에 있으니(주석에 과거 버그 사례가 남아있다), 이 훅을 건드릴 때는 그 방어 로직의 이유를 먼저 이해할 것. 연출 레이어 컴포넌트는 `client/components/effects/`, 보드/패널 UI는 `client/components/game/`에 있다.

**개발 원칙 — 애니메이션과 실제 로직의 순서는 항상 일치해야 한다.** "카드가 팀 동물 영역으로 도착 → 경험치 반영 → 정산해서 레벨업"처럼 사용자가 기대하는 인과 순서를, 화면도 정확히 그 순서로 보여줘야 한다. `gameState.exp`(서버 진실)가 렌더에 반영되는 시점과, 그 값을 가리는 마스킹 상태(`pendingExpCredit`)가 반영되는 시점이 어긋나면 안 된다.

이 마스킹을 **`useEffect`는 물론 `useLayoutEffect`로도 완전히 고칠 수 없었다** — 처음엔 "레이아웃 이펙트로 하면 페인트 전에 동기 반영되니 괜찮다"고 생각했지만 실제로는 부족했다: `gameState`가 바뀌면 그 즉시 (마스킹이 아직 옛 값인 채로) 첫 번째 렌더가 일단 커밋까지 끝나고, 그 직후에야 레이아웃 이펙트가 두 번째(가려진) 렌더로 덮어씌운다. 화면엔 두 번째 커밋만 페인트되어 눈으로는 문제없어 보이지만, 첫 번째(부풀려진) 커밋에도 하위 컴포넌트의 `useEffect`(예: `ScorePanel`의 레벨업 감지, `prevLevelRef` 비교)가 정상적으로 예약되고, 이 패시브 이펙트는 두 번째 커밋이 이미 화면을 바로잡았다는 사실과 무관하게 자신이 렌더될 때 캡처한 "부풀려진" 값을 그대로 들고 나중에(비동기로) 실행돼버려 — 카드가 실제로 도착하기도 전에 "Lv UP!" 연출이 클릭 즉시 터지는 버그로 이어졌다(레이아웃 이펙트로 바꿔도 재발).

**진짜 해법은 이펙트 자체를 쓰지 않는 것**: React가 공식 지원하는 "렌더 도중 상태 보정" 패턴(prop 변화를 ref로 감지해 그 조건 블록 안에서 곧바로 `setState` 호출)으로, `gameState`/`lastEvents`가 바뀐 그 렌더 안에서 마스킹 상태도 함께 동기 반영해버린다(`client/hooks/useAnimationQueue.ts`의 `lastEventsForCreditRef` 블록 참고). 이러면 "부풀려진" 중간 렌더 자체가 커밋되지 않으므로, 그 어떤 하위 `useEffect`/`useLayoutEffect`도 잘못된 값을 관측할 기회가 없다. **교훈: 서버 진실과 그 진실을 가리는 마스킹이 반드시 같은 커밋에서 함께 나타나야 하는 경우, `useLayoutEffect`도 충분하지 않을 수 있다 — 렌더 도중 동기 보정을 우선 고려할 것.**

### 테스트 작성 시 참고
`server/__tests__/spectator.test.ts`는 엔진이 아니라 방(`Room`)을 직접 세우는 유일한 테스트다 — 가짜 WebSocket(`send`가 JSON을 배열에 쌓는 객체)으로 로비 명령을 넣고 브로드캐스트를 읽는다. 게임을 시작시키면 방이 실제 턴 타이머를 걸므로 반드시 `jest.useFakeTimers()`로 감쌀 것(안 그러면 30초짜리 타이머가 남아 프로세스가 붙들린다).

`server/__tests__/effects.test.ts`는 결정론적 RNG(`rng0`=항상 0번째 선택, `rngLast`=항상 마지막 선택)로 `initGame`부터 각 엔진 함수를 직접 호출하는 패턴을 쓴다. `simulation.test.ts`는 봇 대전을 다회 시뮬레이션해 게임이 항상 유한 턴 내에 끝나는지 등 불변조건을 검증한다.
