import { useRef } from "react";

export function useSwipe(
  onSwipeLeft?: () => void,
  onSwipeRight?: () => void,
  threshold = 50
) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;

    // Solo horizontal — no interferir con scroll vertical
    if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx) * 0.8) return;

    if (dx < 0) onSwipeLeft?.();
    if (dx > 0) onSwipeRight?.();
  };

  return { onTouchStart, onTouchEnd };
}
