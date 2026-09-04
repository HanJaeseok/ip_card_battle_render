'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Animal, Place, Team } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAnimationQueue } from '@/hooks/useAnimationQueue';
import { GameLayout } from '@/components/game/GameLayout';
import { GameEndScreen } from '@/components/game/GameEndScreen';
import { playBgm } from '@/lib/bgm';
import { startPreload } from '@/lib/preload';

const STORAGE_TEAM = 'cardBattle_team';
const GAME_BGM_VOLUME = 0.5; // 게임 효과음이 함께 들려야 하므로 BGM은 절반 볼륨으로

export default function GamePage() {
  const router = useRouter();
  const { gameState, turnDeadline, lastEvents, drawCard, chooseSkill, passSkill, error, connected, playerId } = useWebSocket();
  const [myTeam, setMyTeam] = useState<Team | null>(null);

  const animState = useAnimationQueue(lastEvents, gameState);

  // 보통은 로비에서 이미 끝나 있지만, 새로고침·재접속으로 이 페이지에 바로
  // 들어온 경우를 대비해 여기서도 프리로드를 시작한다(이미 시작했으면 무시됨).
  useEffect(() => {
    startPreload();
  }, []);

  // 대기실에서 앉았던 자리. 관전석('spectator')이면 어느 팀도 내 팀이 아니므로 myTeam은
  // null로 남고, 그 null이 곧 게임 화면 전체의 "관전 시점" 스위치가 된다(GameLayout 참고).
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_TEAM) as Team | null;
    if (saved === 'A' || saved === 'B') setMyTeam(saved);
  }, []);

  // 게임 진행 상황에 따른 BGM 전환: 진행 중(game1) → 축제(game2) → 종료(opening)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === 'ended') {
      playBgm('/sounds/bgm_opening.mp3', 0.6);
    } else if (gameState.festival) {
      playBgm('/sounds/bgm_game2.mp3', GAME_BGM_VOLUME);
    } else {
      playBgm('/sounds/bgm_game1.mp3', GAME_BGM_VOLUME);
    }
  }, [gameState?.phase, gameState?.festival]);

  const handlePlaceClick = useCallback(
    (place: Place) => {
      drawCard(place);
    },
    [drawCard],
  );

  const handleChooseSkill = useCallback(
    (animal: Animal) => {
      chooseSkill(animal);
    },
    [chooseSkill],
  );

  const handlePassSkill = useCallback(() => {
    passSkill();
  }, [passSkill]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-jungle-50 flex flex-col items-center justify-center gap-3">
        <p className="text-jungle-700">
          {connected ? '게임 상태 로딩 중...' : '서버에 연결 중...'}
        </p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          onClick={() => router.push('/')}
          className="text-sm text-jungle-400 underline mt-4 hover:text-jungle-600"
        >
          로비로 돌아가기
        </button>
      </div>
    );
  }

  // 체력이 즉시 10/0에 닿아 게임이 끝난 경우, 그 결정타 연출(체력 구슬 반응 +
  // "결정타!" 강조)이 끝까지 재생된 뒤에야 종료 화면으로 넘어간다 — 승리를 만든
  // 그 행동의 손맛을 화면 전환이 잘라먹지 않도록.
  if (gameState.phase === 'ended' && !animState.isSettling) {
    return <GameEndScreen gameState={gameState} myTeam={myTeam} onBack={() => router.push('/')} />;
  }

  return (
    <GameLayout
      gameState={gameState}
      turnDeadline={turnDeadline}
      myTeam={myTeam}
      playerId={playerId}
      onPlaceClick={handlePlaceClick}
      onChooseSkill={handleChooseSkill}
      onPassSkill={handlePassSkill}
      error={error}
      animState={animState}
    />
  );
}
