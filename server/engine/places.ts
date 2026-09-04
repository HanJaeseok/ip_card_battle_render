import {
  ANIMALS,
  OPENING_SHARED_CARD_COUNT,
  OPENING_SHARED_CARD_NUM_MAX,
  OPENING_SHARED_CARD_NUM_MIN,
  PLACES,
  PLACE_ANIMALS,
} from 'shared';
import type { Animal, CardNum, Place, StackedCard } from 'shared';

export type RNG = () => number;

let cardIdCounter = 0;

export function initStacks(): Record<Animal, StackedCard[]> {
  return { sheep: [], rabbit: [], mermaid: [], tiger: [] };
}

/**
 * 무작위 장소 하나. exclude를 주면 그 장소는 후보에서 뺀다 — 시간 초과로 서버가
 * 대신 장소를 골라줄 때(processTimeout)도 "직전 장소 금지" 규칙을 지키기 위해서다.
 * 실용신양/도토리 축제의 예약 뽑기는 이 규칙과 무관하므로 exclude 없이 그대로 쓴다.
 */
export function randomPlace(rng: RNG = Math.random, exclude?: Place | null): Place {
  const options = exclude ? PLACES.filter(p => p !== exclude) : PLACES;
  return options[Math.floor(rng() * options.length)];
}

/**
 * 장소에서 카드 한 장을 뽑는다. 동물은 그 장소가 다루는 동물 중 균등 랜덤(재고 개념 없음),
 * 숫자는 그 장소에 동물이 3종이면 10~15, 2종이면 5~10 범위에서 랜덤으로 나온다.
 */
export function drawCardAt(place: Place, rng: RNG = Math.random): StackedCard {
  const options = PLACE_ANIMALS[place];
  const animal = options[Math.floor(rng() * options.length)];

  const placeAnimalCount = options.length;
  const num = (placeAnimalCount >= 3 ? Math.floor(rng() * 6) + 10 : Math.floor(rng() * 6) + 5) as CardNum;

  return { id: ++cardIdCounter, animal, num, collectedBy: null };
}

/**
 * 게임 시작 시 중앙에 미리 깔아두는 "공유 카드"를 뽑는다 — 선 플레이어가 빈 보드에서
 * 시작해 짝을 만들 수 없던 불합리를 없애기 위한 장치다(shared/constants.ts 참고).
 *
 * 동물은 중복 없이 뽑는다 — 같은 동물 두 장이면 시작하자마자 짝이 되어 선 플레이어가
 * 첫 클릭도 하기 전에 정산되어버린다. 숫자는 장소 뽑기와 무관하게 7~13 사이에서 고른다.
 */
export function dealOpeningSharedCards(rng: RNG = Math.random): StackedCard[] {
  const pool: Animal[] = [...ANIMALS];
  const numSpan = OPENING_SHARED_CARD_NUM_MAX - OPENING_SHARED_CARD_NUM_MIN + 1;

  const cards: StackedCard[] = [];
  for (let i = 0; i < OPENING_SHARED_CARD_COUNT && pool.length > 0; i++) {
    const [animal] = pool.splice(Math.floor(rng() * pool.length), 1);
    const num = (Math.floor(rng() * numSpan) + OPENING_SHARED_CARD_NUM_MIN) as CardNum;
    cards.push({ id: ++cardIdCounter, animal, num, collectedBy: null });
  }
  return cards;
}
