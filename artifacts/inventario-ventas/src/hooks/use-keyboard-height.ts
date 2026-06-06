import { useState, useEffect } from "react";

export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("visualViewport" in window) || !window.visualViewport) return;
    
    const handler = () => {
      const vh = window.visualViewport!;
      const keyboardH = window.innerHeight - vh.height - vh.offsetTop;
      setKeyboardHeight(Math.max(0, keyboardH));
    };
    
    window.visualViewport.addEventListener("resize", handler);
    window.visualViewport.addEventListener("scroll", handler);
    handler();
    return () => {
      window.visualViewport?.removeEventListener("resize", handler);
      window.visualViewport?.removeEventListener("scroll", handler);
    };
  }, []);

  return keyboardHeight;
}
