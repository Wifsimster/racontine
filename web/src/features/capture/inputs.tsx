import { useState } from "react";
import { Baby, Camera, Check, ChevronDown, X } from "lucide-react";
import { type Child, type EntrySource, SOURCE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pageCount, type Shot } from "./model";
const SOURCES: EntrySource[] = ["nounou", "mam", "creche", "maison"];

/* Ce qu'on règle AVANT d'envoyer : la journée (enfant, date, lieu) et les
   pages déjà prises. */

export function Tip({
  Icon,
  children,
}: {
  Icon: typeof Camera;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-card px-4 py-3 text-left shadow-card">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="text-meta text-muted-foreground">{children}</span>
    </li>
  );
}

/* --------------------------------------------------------------------------
   La ligne de contexte : QUI, et OÙ. Repliée par défaut, jamais cachée.
   -------------------------------------------------------------------------- */

export function DayRow({
  kids,
  childId,
  onChildId,
  source,
  onSource,
}: {
  kids: Child[];
  childId: string;
  onChildId: (id: string) => void;
  source: EntrySource;
  onSource: (s: EntrySource) => void;
}) {
  const [open, setOpen] = useState(false);
  const name = kids.find((c) => c.id === childId)?.name;

  return (
    <section className="rounded-2xl border bg-card shadow-card">
      {/* Un `<button aria-expanded>` plutôt qu'un `<details>` : la hauteur de
          44 px est alors garantie (un `<summary>` en `display: flex` se mesure
          mal) et l'état déplié est annoncé. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="journee-reglages"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left transition-colors dur-fast ease-carnet hover:bg-accent",
          // Déplié, la teinte de survol ne doit pas arrondir ses coins bas
          // au-dessus du filet de séparation.
          open ? "rounded-t-2xl" : "rounded-2xl",
        )}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <Baby className="size-4" aria-hidden="true" />
        </span>
        {/* `gap-x-1.5` (6 px) : l'écart optique entre un prénom, un point médian
            et un lieu — pas un pas de mise en page. */}
        {/* Le cran « interface » (15/20) et non le surtitre : c'est une phrase
            (« qui, et où »), pas un intertitre. En capitales espacées, la ligne
            se lisait comme un en-tête de section et le prénom de l'enfant
            perdait son statut de contenu. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-ui">
          <span className="font-bold text-foreground">
            {name ?? "Votre enfant"}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{SOURCE_LABELS[source]}</span>
        </span>
        <span className="text-meta text-muted-foreground">Modifier</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform dur-base ease-carnet",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          id="journee-reglages"
          className="flex flex-col gap-4 border-t px-4 py-4"
        >
          {kids.length > 1 && (
            <div className="flex flex-col gap-1.5">
              {/* `gap-1.5` (6 px) : demi-pas libellé <-> champ. */}
              <Label htmlFor="capture-enfant">Enfant</Label>
              <Select
                id="capture-enfant"
                value={childId}
                onChange={(e) => onChildId(e.target.value)}
              >
                {kids.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {kids.length === 0 && (
            <p className="text-meta text-muted-foreground">
              Un profil sera créé au premier envoi ; vous le renommerez ensuite.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label id="capture-lieu">Lieu de la journée</Label>
            {/* Un groupe de bascules, pas quatre boutons indépendants :
                `aria-pressed` dit lequel est choisi sans compter sur la
                couleur. */}
            <div
              role="group"
              aria-labelledby="capture-lieu"
              className="flex flex-wrap gap-2"
            >
              {SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={source === s ? "default" : "outline"}
                  size="sm"
                  aria-pressed={source === s}
                  onClick={() => onSource(s)}
                >
                  {source === s && <Check aria-hidden="true" />}
                  {SOURCE_LABELS[s]}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------------------
   Les pages photographiées. La photo est le sujet de l'écran, pas une pièce
   jointe : rayon accordé à la carte, liseré de 1 px pour qu'une page crème garde
   son bord sur du papier crème — et jamais d'ombre portée sur l'image (l'ombre
   appartient à la carte). Le numéro et le retrait vivent sur une ligne OPAQUE de
   44 px sous l'image : un voile posé sur une photo inconnue n'est jamais un
   contraste mesuré, et une croix de 22 px n'est pas une cible.

   DEUX CORRECTIONS MESURÉES, toutes deux visibles à 320, 390 et 1280 :

   · LE RATIO EST CELUI DE LA PAGE, PAS UN ARRONDI. La vignette déclarait 4/5
     (0,800) alors qu'une page de carnet stockée par le produit fait 900×1010,
     soit 0,891 : `object-contain` laissait donc 10,9 px de vide EN HAUT ET EN BAS
     de chaque vignette (21,8 px sur une tuile de 213,8 — 10 % de l'image). Le
     ratio déclaré est maintenant 9/10 (0,900) : l'écart tombe à 1,7 px de côté,
     et un vide latéral se lit comme « une page posée sur un plateau », alors
     qu'un vide haut/bas se lit comme un trou.
   · LE PLATEAU A SA PROPRE SURFACE. Ce champ était `bg-card` — exactement la
     couleur de la ligne de légende juste dessous, au pixel près : la bande ne
     ressemblait donc pas à un plateau de scanner mais à un décalage accidentel,
     et le seul séparateur était un filet de 1 px. Le champ passe sur `--muted`
     (encre froide pâle), la feuille reste `--card` (crème) : les deux surfaces se
     distinguent, quel que soit le cadrage de la photo qu'on y pose.

   COLONNES : une page seule — et deux pages, le cas d'un carnet ouvert — prennent
   TOUTE la largeur. À deux colonnes, deux pages ne consommaient que 236 px de
   hauteur et laissaient 117 px de papier mort avant le bouton (14 % du viewport,
   dans l'état où le parent a fait le travail) : la ligne de flottaison montrait
   qu'il y avait MOINS, pas plus. En pleine largeur, la page est réellement
   lisible — c'est la fonction de la vignette — et la seconde page dépasse sous le
   fondu, ce qui dit « il y en a d'autres ». À partir de trois pages, deux
   colonnes redeviennent la bonne réponse : la grille remplit alors l'écran seule.
   -------------------------------------------------------------------------- */

export function PageGrid({
  shots,
  onRemove,
}: {
  shots: Shot[];
  onRemove: (index: number) => void;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-3 border-b pb-2">
        <h2 className="surtitre text-muted-foreground">Pages du carnet</h2>
        <p className="surtitre text-muted-foreground" data-tabular>
          {pageCount(shots.length)}
        </p>
      </div>
      {/* Le nombre de colonnes suit le nombre de pages ET la largeur réelle de
          la colonne de lecture (32 rem au maximum) :
            1 page   → pleine largeur, toujours ;
            2 pages  → pleine largeur sur un téléphone, deux colonnes dès que la
                       colonne dépasse ~500 px (là, deux vignettes de 250 px
                       restent lisibles et l'écran se remplit d'un coup) ;
            3 et plus→ deux colonnes : la grille remplit alors l'écran seule. */}
      <ul
        className={cn(
          "mt-3 grid gap-3",
          shots.length === 1
            ? "grid-cols-1"
            : shots.length === 2
              ? "grid-cols-1 min-[560px]:grid-cols-2"
              : "grid-cols-2",
        )}
      >
        {shots.map((s, i) => (
          <li
            key={s.id}
            className="flex flex-col rounded-2xl border bg-card shadow-card"
          >
            {/* `object-contain`, et c'est un choix FONCTIONNEL : la vignette
                sert à vérifier que la page entière est dans le cadre. Un
                `object-cover` recadrait la page et tranchait ses propres mots
                sur les deux bords — joli, mais il cachait précisément le défaut
                qu'on demande au parent de repérer. Le champ `--muted` est le
                plateau du scanner, distinct de la feuille `--card` ; le ratio
                9/10 est celui d'une page de carnet (900×1010). */}
            <div className="seam overflow-hidden rounded-t-2xl bg-muted">
              <img
                src={s.url}
                alt={`page ${i + 1}`}
                className="aspect-[9/10] w-full object-contain"
              />
            </div>
            <div className="flex h-11 items-center gap-1 border-t pr-1 pl-3">
              <span
                className="surtitre flex-1 text-muted-foreground"
                data-tabular
              >
                Page {i + 1}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Retirer la page ${i + 1}`}
                onClick={() => onRemove(i)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------------------
   L'attente : où on en est, ce qui arrive, et que rien ne se perd.
   -------------------------------------------------------------------------- */

