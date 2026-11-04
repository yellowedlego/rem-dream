// 마리오식 카메라(데드존 추적): 보는 칸(viewH) 안에서 비추는 자리(focusY)가 위·아래 여백(margin) 안쪽이면
// 카메라(scrollTop)는 가만히 있고, 여백에 닿으면 그 여백이 유지되도록 딱 그만큼만 따라간다.
// 반대 방향으로 가는 동안에는 다시 여백에 닿을 때까지 그대로 있다.

/**
 * 거꾸로 쓰는 마리오식 카메라: 달창(viewH 높이, 스크롤 위치 scrollTop)을 사람이 굴릴 때,
 * 대화가 비추는 자리(focusY)가 달창 위·아래 여백(margin) 안쪽이면 대화는 가만히 있고,
 * 여백에 닿으면 그 여백에 머물도록 비추는 자리를 밀어낸 값을 돌려준다 (대화가 그만큼 따라간다).
 */
export function pushFocus(focusY: number, scrollTop: number, viewH: number, margin: number) {
  const m = Math.min(margin, viewH / 2);
  return Math.min(scrollTop + viewH - m, Math.max(scrollTop + m, focusY));
}

/** 새 scrollTop을 돌려준다. maxScroll은 스크롤 가능한 가장 큰 값. */
export function followCamera(focusY: number, scrollTop: number, viewH: number, margin: number, maxScroll: number) {
  const m = Math.min(margin, viewH / 2); // 여백이 칸의 절반을 넘으면 가운데에 붙잡아 두는 것과 같다
  let next = scrollTop;
  if (focusY < scrollTop + m) next = focusY - m;
  else if (focusY > scrollTop + viewH - m) next = focusY - viewH + m;
  return Math.min(Math.max(0, maxScroll), Math.max(0, next));
}
