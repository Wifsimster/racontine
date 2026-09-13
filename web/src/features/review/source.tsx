import { useEffect, useState } from "react";
import type React from "react";
import { Images, RotateCw, X } from "lucide-react";
import { type AttachmentRef } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
/* LA SOURCE mise en regard de la journée : la page photographiée et la
   transcription mot à mot. */

/* ===========================================================================
   L'ATTENTE DU GESTE LE PLUS CONSÉQUENT DU PRODUIT.

   Mesuré sur un PATCH /api/entries/:id qui ne revient jamais : à 1,5 s, 6 s et
   20 s l'écran était IDENTIQUE — un bouton désactivé, une roue, `aria-busy`, le
   libellé « Publier la journée » inchangé, la ligne du dessus disant toujours
   « 1 lecture sera publiée telle quelle » au présent. Aucun nœud `role="status"`
   ne se déclenchait, aucun temps, aucun compte, aucune escalade, aucune sortie.
   Le produit savait déjà faire mieux ailleurs (« Envoi de 1 page vers
   Racontine… », « page 2 sur 3 en cours de lecture », « Le carnet met du temps à
   venir ») : le seul endroit resté muet était celui qui compte.

   CE QU'ON PEUT DIRE HONNÊTEMENT, et rien de plus :
     · CE QUI PART : le nombre de moments et de pages — un compte, pas une roue.
     · DEPUIS QUAND : les secondes écoulées, en chiffres tabulaires. C'est la
       seule grandeur déterminée dont on dispose : le serveur ne rapporte pas
       l'avancement d'un PATCH, et inventer un pourcentage de publication serait
       un mensonge dessiné.
     · LA BARRE mesure donc le temps CONTRE LA DURÉE HABITUELLE (3 s), plafonnée
       à 92 % : elle n'atteint jamais le bout tant que ce n'est pas fini, et
       au-delà de l'habituel elle s'arrête et la phrase prend le relais.
     · L'ESCALADE : à 5 s « c'est plus long que d'habitude », à 12 s « le carnet
       ne répond toujours pas ». Deux phrases, deux annonces `role="status"`.
     · LA SORTIE, à partir de 3 s : « Arrêter d'attendre ». Elle n'est pas
       nommée « annuler » : abandonner la requête n'annule rien côté serveur, et
       le message qui suit le dit mot pour mot.
   =========================================================================== */


/* LA SOURCE mise en regard de la journée : la page photographiée et la
   transcription mot à mot. */

/** Touche clavier montrée dans la barre d'action (chemin clavier visible).
 *  `py-0` + `leading-5` : la capsule mesure 20 px, la HAUTEUR D'UNE LIGNE de la
 *  barre. C'est ce qui permet de montrer le chemin clavier à 390 px (où il
 *  passe à la ligne) sans faire grossir le chrome : 131 px de barre avec des
 *  capsules à `py-1`, 121 px avec celles-ci — 21,1 % de l'écran au lieu de
 *  22,3 %, sous le plafond de 22 % que cet écran s'est fixé. */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border bg-card px-1.5 font-sans text-overline font-bold leading-5 tracking-normal text-foreground">
      {children}
    </kbd>
  );
}

/**
 * UNE PAGE DE CARNET, DANS LE SENS OÙ ON PEUT LA LIRE.
 *
 * Un carnet de liaison se photographie d'une main, au-dessus d'un plan de
 * travail, souvent en tendant le bras par-dessus la table de la nounou : une
 * page sur deux arrive de travers ou franchement à l'envers. L'écran de
 * relecture la posait alors telle quelle — et la SEULE chose que cet écran
 * demande est justement de confronter ce qui est écrit à ce qui a été lu. Une
 * page à l'envers rend cette confrontation impossible : il fallait ouvrir la
 * photo dans un onglet, puis tourner la tête.
 *
 * Le bouton tourne la page d'un quart de tour à chaque appui, ET LE GARDE : le
 * serveur réécrit la photo et sa miniature. La page redressée l'est partout —
 * ici, sur la timeline, dans la visionneuse — et le reste à la prochaine
 * ouverture. Avant, la rotation n'était qu'un confort d'affichage perdu à la
 * fermeture de l'écran : la même page de travers était à retourner à chaque
 * relecture, et une journée publiée restait de travers pour tous ses lecteurs.
 *
 * `quarter` ne porte donc plus que la rotation EN ATTENTE de réponse du
 * serveur : le geste s'affiche à la main, pas au réseau, et retombe à zéro dès
 * que la photo réécrite arrive avec ses nouvelles proportions.
 *
 * La géométrie : à un quart ou trois quarts de tour, la largeur et la hauteur
 * s'échangent. Le cadre prend donc le rapport INVERSE de l'image et celle-ci est
 * dimensionnée pour que son encombrement APRÈS rotation remplisse exactement ce
 * cadre — sans quoi une page tournée déborderait sur la colonne voisine ou
 * laisserait une bande de vide sous elle. Les dimensions viennent du serveur
 * quand il les connaît, du chargement de l'image sinon.
 */
export function SourcePage({
  attachment,
  index,
  total,
  quarter,
  onRotate,
  rotating,
  removing,
  onRemove,
}: {
  attachment: AttachmentRef;
  index: number;
  total: number;
  quarter: number;
  onRotate: (() => void) | null;
  rotating: boolean;
  removing: boolean;
  onRemove: (() => void) | null;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(
    attachment.width && attachment.height
      ? { w: attachment.width, h: attachment.height }
      : null,
  );
  /* La page tournée revient du serveur avec largeur et hauteur ÉCHANGÉES. Sans
     cette reprise, le cadre garderait le rapport d'avant la rotation (l'état
     n'est initialisé qu'au montage) et la photo redressée déborderait. */
  useEffect(() => {
    if (attachment.width && attachment.height)
      setNatural({ w: attachment.width, h: attachment.height });
  }, [attachment.width, attachment.height]);
  // Tant que les proportions sont inconnues, la page reste droite : mieux vaut
  // un bouton qui attend une fraction de seconde qu'une image qui déborde.
  const known = natural !== null;
  const q = known ? ((quarter % 4) + 4) % 4 : 0;
  const quart = q % 2 === 1;
  const w = natural?.w ?? 1;
  const h = natural?.h ?? 1;

  return (
    <figure className="relative">
      <a
        href={attachment.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`Ouvrir la page ${index + 1} en grand`}
        className="seam relative block w-full overflow-hidden rounded-xl bg-muted"
        style={
          known
            ? { aspectRatio: quart ? `${h} / ${w}` : `${w} / ${h}` }
            : undefined
        }
      >
        <img
          src={attachment.url}
          alt={`Page ${index + 1} du carnet`}
          onLoad={(e) => {
            if (known) return;
            const img = e.currentTarget;
            if (img.naturalWidth && img.naturalHeight)
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          className={cn(
            "block max-w-none",
            known
              ? "absolute top-1/2 left-1/2 origin-center transition-transform dur-base ease-carnet"
              : "w-full",
          )}
          style={
            known
              ? {
                  width: quart ? `${(w / h) * 100}%` : "100%",
                  transform: `translate(-50%, -50%) rotate(${q * 90}deg)`,
                }
              : undefined
          }
        />
      </a>
      <figcaption className="surtitre mt-2 text-muted-foreground">
        Page {index + 1} sur {total}
      </figcaption>
      {/* En bas, sur la photo : en haut, les boutons se posaient sur la date
          manuscrite, la seule ligne qu'on veut relire. */}
      {onRotate && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="absolute bottom-9 left-2 rounded-full"
          // Une seule rotation à la fois : deux quarts de tour en vol
          // réécriraient le même fichier chacun de son côté.
          disabled={!known || rotating}
          loading={rotating}
          onClick={onRotate}
          title="Tourner la page (la photo est enregistrée dans ce sens)"
          aria-label={`Tourner la page ${index + 1} d'un quart de tour`}
        >
          {rotating ? null : <RotateCw aria-hidden="true" />}
        </Button>
      )}
      {onRemove && (
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="absolute right-2 bottom-9 rounded-full"
          loading={removing}
          onClick={onRemove}
          aria-label={`Retirer la page ${index + 1}`}
        >
          {removing ? null : <X aria-hidden="true" />}
        </Button>
      )}
    </figure>
  );
}

export function SourceTab({
  id,
  panel,
  selected,
  onSelect,
  Icon,
  children,
}: {
  id: string;
  panel: string;
  selected: boolean;
  onSelect: () => void;
  Icon: typeof Images;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panel}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-meta font-bold",
        "transition-colors dur-fast ease-carnet",
        selected
          ? "bg-card text-foreground shadow-card"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {children}
    </button>
  );
}

/* ------------------------------ Les états -------------------------------- */

