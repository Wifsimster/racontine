import { useEffect, useRef, useState } from "react";

/**
 * LE SENS DU DÉFILEMENT — pour que le bouton flottant cesse de recouvrir la
 * journée suivante.
 *
 * Mesuré : « Photographier le carnet » occupe les 104 derniers pixels de
 * l'écran en permanence, soit 12 % de la hauteur d'un téléphone, posés sur la
 * carte d'en dessous. Le geste central du produit ne peut pas disparaître pour
 * autant : il s'efface quand on DESCEND (on lit, on ne photographie pas) et
 * revient dès qu'on remonte d'un pouce — le mouvement même qu'on fait quand on
 * cherche une action.
 *
 * Deux garde-fous :
 *   · un seuil de 24 px, sinon le rebond élastique d'iOS suffit à faire
 *     clignoter le bouton ;
 *   · toujours visible dans les 200 premiers pixels — en haut du carnet, rien
 *     ne justifie de cacher l'action.
 */
export function useDefilementDescendant(seuil = 24): boolean {
  const [descend, setDescend] = useState(false);
  const dernier = useRef(0);

  useEffect(() => {
    dernier.current = window.scrollY;
    let attendu = false;
    const onScroll = () => {
      if (attendu) return;
      attendu = true;
      // Une frame par lot : le gestionnaire ne fait aucun travail de mise en
      // page, mais il est appelé à chaque pixel sur un défilement au doigt.
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
