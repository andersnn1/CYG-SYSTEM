import { useState, useRef } from "react";

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const startY = useRef(0);
  const [isPulling, setIsPulling] = useState(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };

  const onTouchEnd = async (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 80 && window.scrollY === 0) {
      setIsPulling(true);
      try {
        await onRefresh();
      } catch (err) {
        console.error(err);
      } finally {
        setIsPulling(false);
      }
    }
  };

  return { isPulling, onTouchStart, onTouchEnd };
}
