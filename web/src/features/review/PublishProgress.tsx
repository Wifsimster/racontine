import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
/* L'attente de la publication : ce qu'on peut dire honnêtement d'une requête
   dont le serveur ne rapporte pas l'avancement. */

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


/* L'attente de la publication : ce qu'on peut dire honnêtement d'une
   requête dont le serveur ne rapporte pas l'avancement. */

export const PUBLISH_USUAL_SECONDS = 3;

export function PublishProgress({
  seconds,
  moments,
  pages,
  republish,
  onStopWaiting,
}: {
  seconds: number;
  moments: number;
  pages: number;
  republish: boolean;
  onStopWaiting: () => void;
}) {
  const pct = Math.min(
    92,
    Math.round((seconds / PUBLISH_USUAL_SECONDS) * 100) || 8,
  );
  const what = [
    `${moments} moment${moments > 1 ? "s" : ""}`,
    pages > 0 ? `${pages} page${pages > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const line =
    seconds >= 12
      ? "Le carnet ne répond toujours pas."
      : seconds >= 5
        ? "C’est plus long que d’habitude."
        : republish
          ? `Republication en cours : ${what}.`
          : `Publication en cours : ${what}, puis les proches sont prévenus.`;

  return (
    <div className="flex flex-col gap-2">
      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] dur-slow ease-page"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        {/* Le compteur de secondes est HORS de la région annoncée : une annonce
            par seconde noierait la phrase qui, elle, porte le sens. */}
        <p role="status" className="min-w-0 text-meta text-muted-foreground">
          {line}
        </p>
        <p
          aria-hidden="true"
          data-tabular
          className="shrink-0 text-meta text-muted-foreground"
        >
          {seconds}&nbsp;s
        </p>
      </div>
      {seconds >= 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          onClick={onStopWaiting}
        >
          <X aria-hidden="true" />
          Arrêter d’attendre
        </Button>
      )}
    </div>
  );
}

/* ===========================================================================
   LA JOURNÉE EN LECTURE — ce que reçoit un LECTEUR sur /entries/:id.

   Le serveur donne la journée publiée à tous les membres du carnet ; c'est
   l'éditeur qui ne leur appartient pas. Cet écran n'est donc pas un refus : la
   journée est là, en entier, sur les lignes du cahier — seule la barre de
   publication a disparu, remplacée par la phrase qui explique pourquoi et par
   la sortie vers le journal.
   =========================================================================== */

