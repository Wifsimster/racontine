import { Link } from "react-router-dom";
import { BookOpenText, Check, Smile, Star } from "lucide-react";
import { type Entry, SOURCE_LABELS } from "@/lib/types";
import { capitalize, longDate } from "@/lib/format";
import { itemKind } from "@/lib/items";
import { glanceOf, toDraftItems } from "./draft";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
/* La journée telle qu'un LECTEUR la reçoit : on la lit, on ne la corrige pas. */

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


/* La journée pour un LECTEUR : on la lit, on ne la corrige pas. */

export function ReadOnlyDay({ entry }: { entry: Entry }) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4 pb-12">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="surtitre text-muted-foreground">
            {[entry.child?.name, capitalize(longDate(entry.date)), SOURCE_LABELS[entry.source]]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h1 className="mt-1 font-serif text-title font-semibold text-balance">
            {entry.title || "La journée"}
          </h1>
        </div>
        <Badge variant="success" className="mt-0.5">
          <Check aria-hidden="true" />
          Publiée
        </Badge>
      </header>

      <article className="relative overflow-hidden rounded-2xl border bg-card py-4 pr-5 pl-7 shadow-card">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-5 w-[1.5px] bg-[var(--rule-margin)]"
        />
        {entry.story ? (
          <div className="paper-ruled paper-ruled--plain -mr-5 -ml-7 pr-5 pl-7">
            <p className="carnet-story text-foreground">{entry.story}</p>
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">
            Cette journée n’a pas de récit : seules les pages du carnet ont été
            gardées.
          </p>
        )}
        {entry.highlight && (
          <p className="mt-4 flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-ui">
            <Star
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            />
            <span>
              <span className="font-bold">Le temps fort</span> —{" "}
              {entry.highlight}
            </span>
          </p>
        )}
      </article>

      {/* LA JOURNÉE, pas seulement le récit. Un lecteur arrive ici par une
          notification (« la journée de Louise est publiée » -> /entries/:id) :
          il doit y trouver la journée ENTIÈRE — les moments et l'humeur compris —
          et non un extrait qui l'obligerait à repartir vers le journal pour lire
          ce qu'il venait lire. Mêmes libellés, mêmes glyphes, même ordre que
          partout ailleurs ; les pastilles de confiance, elles, restent à l'écran
          de relecture : elles ne veulent rien dire pour qui ne tranche pas. */}
      {entry.items.length > 0 && (
        <ul className="mt-4 rounded-2xl border bg-card px-4 shadow-card">
          {toDraftItems(entry.items).map((it, i) => {
            const { label, value } = glanceOf(it);
            const Icon = itemKind(it.type).Icon;
            return (
              <li
                key={i}
                className="flex min-h-14 items-center gap-3 border-b py-2 last:border-b-0"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-muted">
                  <Icon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0">
                  <span className="surtitre block text-muted-foreground">
                    {label}
                  </span>
                  <span className="block text-ui text-pretty">{value}</span>
                </span>
              </li>
            );
          })}
          {entry.mood && (
            <li className="flex min-h-14 items-center gap-3 border-b py-2 last:border-b-0">
              <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-muted">
                <Smile
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0">
                <span className="surtitre block text-muted-foreground">
                  Humeur
                </span>
                <span className="block text-ui text-pretty">{entry.mood}</span>
              </span>
            </li>
          )}
        </ul>
      )}

      {entry.attachments.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="surtitre text-muted-foreground">
            La page du carnet
            {entry.attachments.length > 1 ? ` · ${entry.attachments.length}` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {entry.attachments.map((a, i) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ouvrir la page ${i + 1} en grand`}
                className="seam block overflow-hidden rounded-xl bg-muted"
              >
                <img
                  src={a.thumbUrl}
                  alt={`Page ${i + 1} du carnet`}
                  className="block aspect-square w-full object-cover object-top"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      <p className="mt-5 flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-meta text-muted-foreground">
        <BookOpenText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Vous suivez ce carnet en{" "}
          <span className="font-bold text-foreground">lecture</span> : la
          journée telle qu’elle a été publiée. La corriger revient à la famille
          qui tient le carnet.
        </span>
      </p>

      <Button asChild className="mt-4 w-full">
        <Link to="/">
          <BookOpenText aria-hidden="true" />
          Revenir au journal
        </Link>
      </Button>
    </div>
  );
}

