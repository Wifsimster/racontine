import { LoginBackground } from "@/components/LoginBackground";

/* ===========================================================================
   LES PORTES — les écrans qui vivent HORS de la coquille.

   Il y en a deux, et deux seulement : la connexion (`pages/Login.tsx`) et la
   réception d'une invitation (`pages/Invite.tsx`). Elles ne partagent pas
   seulement l'absence d'en-tête : elles sont le même objet, la première page
   d'un carnet qu'on n'a pas encore ouvert. L'invitation empruntait un `rounded-xl
   border bg-card` et un titre en `text-3xl` — la seule surface de l'app qui
   n'était pas du papier réglé, sur le seul écran que la moitié des utilisateurs
   (les proches) voient EN PREMIER.

   Ce module ne contient donc aucune décision nouvelle : il range celles que la
   porte de connexion a déjà prises — la réglure, la colonne de 26 rem, la
   feuille au trait de marge — pour que la seconde porte les hérite au lieu de
   les réinventer. `Login.tsx` garde sa copie ; on ne touche pas à son ouvrage.
   =========================================================================== */

/**
 * La page d'une porte : la réglure du carnet, puis la colonne de lecture.
 * Retrait haut de 84 px (3 x 28) et retrait gauche de 40 px (marge + gouttière)
 * — les mêmes que la connexion, pour que les deux écrans se superposent.
 */
export function DoorPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate min-h-svh overflow-hidden pt-safe pb-safe">
      <LoginBackground />
      <div className="rise-enter mx-auto flex w-full max-w-[26rem] flex-col pt-[5.25rem] pr-5 pb-6 pl-10">
        {children}
      </div>
    </div>
  );
}

/**
 * Le bandeau : le surtitre imprimé, le nom de l'instance, la promesse.
 * `carnet-story` (17/28) pose la phrase sur la première réglure pleine.
 */
export function DoorHeading({
  appName,
  children,
}: {
  appName: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="surtitre text-muted-foreground">Carnet de liaison</p>
      <h1 className="mt-4 font-serif text-display font-semibold text-foreground">
        {appName}
      </h1>
      <p className="carnet-story mt-4 text-foreground">{children}</p>
    </>
  );
}

/** La feuille : elle sort de la marge à gauche, exactement comme à la connexion. */
export function DoorSheet({
  children,
  role,
  className = "",
}: {
  children: React.ReactNode;
  role?: string;
  className?: string;
}) {
  return (
    <div
      role={role}
      className={`relative mt-7 -ml-4 flex flex-col gap-5 rounded-r-2xl border border-l-0 bg-card p-5 pl-4 shadow-card ${className}`}
    >
      {/* Le trait de marge, redessiné sur le bord de la feuille : la feuille est
          opaque et masquerait celui du fond, l'axe doit rester continu. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[1.5px]"
        style={{ background: "var(--rule-margin)" }}
      />
      {children}
    </div>
  );
}

/**
 * Le titre d'une feuille et sa tuile d'icône. La tuile est un repère NON
 * chromatique par défaut ; `done` (vert) et `warn` (ambre) ne servent qu'à
 * distinguer un acquis d'un incident — jamais à décorer.
 */
export function DoorSheetTitle({
  icon: Icon,
  title,
  tone = "neutral",
  id,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone?: "neutral" | "done" | "warn";
  id?: string;
}) {
  const tile =
    tone === "done"
      ? "bg-success-bg text-success"
      : tone === "warn"
        ? "bg-warning-bg text-warning"
        : "bg-muted text-muted-foreground";
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-md ${tile}`}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <h2 id={id} className="font-serif text-title font-semibold text-balance">
        {title}
      </h2>
    </div>
  );
}
