import { useEffect, useRef, useState } from "react";

export function useDefilementDescendant(seuil = 24): boolean {
  const [descend, setDescend] = useState(false);
  const dernier = useRef(0);

  useEffect(() => {
    dernier.current = window.scrollY;
    let attendu = false;
    const onScroll = () => {
      if (attendu) return;
      attendu = true;
      requestAnimationFrame(() => {
        attendu = false;
        const y = window.scrollY;
        const delta = y - dernier.current;
        if (Math.abs(delta) < seuil) return;
        dernier.current = y;
        setDescend(y > 200 && delta > 0);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [seuil]);

  return descend;
}
