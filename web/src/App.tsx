import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import {
  BookOpenText,
  ChevronRight,
  LogOut,
  Menu,
  Settings,
  Share2,
  CircleUser,
  Users,
  X,
} from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import NotificationsBell from "@/components/NotificationsBell";

/* ===========================================================================
   La coquille : en-tête collant, navigation, transition de page, zones sûres.

   Avant, l'en-tête alignait SIX icônes de 32 px — 6 cibles ratées sur 7, et
   288 px de chrome sur les 390 px de large d'un téléphone. Maintenant il porte
   deux choses de 44 px (les notifications, la navigation) et le nom de
   l'instance ; tout le reste est dans un panneau qui descend.

   Pourquoi un panneau et pas une barre d'onglets en bas : trois écrans
   (journal, relecture, réglages) ont DÉJÀ leur propre barre d'action collée en
   bas — « Photographier le carnet », « Publier », « Enregistrer ». Une barre
   d'onglets viendrait s'y superposer. Le chrome haut coûte 56 px, soit 7 % de
   l'écran : le carnet garde 93 % de la place.
   =========================================================================== */

type NavItem = {
  to: string;
  label: string;
  icon: typeof BookOpenText;
  hint: string;
};

export default function App() {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  const [isOwner, setIsOwner] = useState(false);
  const [appName, setAppName] = useState("Racontine");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Nom de l'instance + accès aux réglages (le lien n'apparaît qu'au propriétaire).
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    api
      .me()
      .then((me) => setIsOwner(me.isOwner))
      .catch(() => setIsOwner(false));
    api
      .publicSettings()
      .then((s) => setAppName(s.appName))
      .catch(() => {});
  }, [userId]);

  // Le panneau se ferme au changement de page…
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // …et à la touche Échap, en rendant le focus au bouton qui l'a ouvert.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (isPending) return <AppSplash />;

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const items: NavItem[] = [
    {
      to: "/",
      label: "Le journal",
      icon: BookOpenText,
      hint: "Les journées, de la plus récente",
    },
    {
      to: "/proches",
      label: "Les proches",
      icon: Users,
      hint: "Qui reçoit les journées",
    },
    {
      to: "/partage",
      label: "Partager",
      icon: Share2,
      hint: "Inviter quelqu'un au carnet",
    },
    {
      to: "/compte",
      label: "Mon compte",
      icon: CircleUser,
      hint: "Votre profil",
    },
  ];
  if (isOwner) {
    items.push({
      to: "/reglages",
      label: "Réglages",
      icon: Settings,
      hint: "L'instance, la lecture, les envois",
    });
  }

  return (
    <div className="min-h-svh">
      {/* Le clavier arrive d'abord sur le contenu, pas sur la navigation.
          Le lien est rangé HORS de l'écran (translation), pas réduit à 1 px par
          `sr-only` : un lien de 1 x 1 px est une cible ratée dès qu'un clavier
          le fait apparaître, et il faut qu'il fasse ses 44 px quand il arrive. */}
      <a
        href="#contenu"
        className="fixed top-2 left-4 z-60 -translate-y-24 rounded-xl bg-card px-4 py-3 text-ui font-bold text-foreground shadow-lift transition-transform dur-slow ease-page focus-visible:translate-y-0"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-50 border-b bg-surface-bar px-safe pt-safe backdrop-blur-md">
        <div className="shell-width flex h-header items-center justify-between gap-2 px-4">
          <Link
            to="/"
            className="-ml-1 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-1 transition-colors dur-fast hover:bg-accent"
          >
            <BookOpenText
              className="size-6 shrink-0 text-primary"
              aria-hidden="true"
            />
            <span className="truncate font-serif text-title font-semibold">
              {appName}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsBell />
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={menuOpen}
              aria-controls="menu-principal"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-overlay"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="menu-principal"
            aria-label="Navigation principale"
            className="panel-down fixed inset-x-0 top-header z-40 px-safe"
          >
            {/* `px-safe` et `px-4` sur deux éléments distincts : sur un même
                élément, la marge de sécurité écraserait la gouttière. */}
            <div className="shell-width px-4">
              <div className="mt-2 rounded-2xl border bg-popover p-2 text-popover-foreground shadow-lift">
                {items.map(({ to, label, icon: Icon, hint }) => {
                  const active =
                    to === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(to);
                  return (
                    <Link
                      key={to}
                      to={to}
                      aria-current={active ? "page" : undefined}
                      className="group flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 transition-colors dur-fast hover:bg-accent aria-[current=page]:bg-primary-soft"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-aria-[current=page]:bg-primary group-aria-[current=page]:text-primary-foreground">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-bold group-aria-[current=page]:text-primary">
                          {label}
                        </span>
                        <span className="block truncate text-meta text-muted-foreground">
                          {hint}
                        </span>
                      </span>
                      {active ? (
                        <span className="surtitre shrink-0 text-primary">
                          ici
                        </span>
                      ) : (
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  );
                })}

                <div className="mx-2 my-2 border-t" />

                <button
                  type="button"
                  onClick={() =>
                    signOut().then(() => (window.location.href = "/login"))
                  }
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors dur-fast hover:bg-accent"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <LogOut className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-ui font-bold">
                    Se déconnecter
                  </span>
                </button>

                <p className="px-4 pt-2 pb-1 text-meta text-muted-foreground">
                  {appName} · version {__APP_VERSION__}
                </p>
              </div>
            </div>
          </nav>
        </>
      )}

      {/* La page fond en 220 ms ; on n'anime PAS de transformation ici, sinon
          les barres d'action `fixed` des pages se recalent sur `main`. */}
      <main
        id="contenu"
        key={location.pathname}
        className="page-enter pb-safe px-safe"
      >
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Ouverture de l'app : on ne montre pas « Chargement… », on montre la FORME de
 * ce qui arrive — le bandeau du carnet puis une journée en attente. Le message
 * réel est annoncé aux lecteurs d'écran via `role="status"`.
 */
function AppSplash() {
  return (
    <div className="min-h-svh bg-background">
      <div className="border-b px-safe pt-safe">
        <div className="shell-width flex h-header items-center gap-2 px-4">
          <BookOpenText className="size-6 text-primary" aria-hidden="true" />
          <span className="font-serif text-title font-semibold">Racontine</span>
        </div>
      </div>
      <div className="px-4 pt-6" aria-hidden="true">
        <div className="skeleton h-4 w-28" />
        <div className="mt-6 rounded-2xl border bg-card p-5 shadow-card">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-6 w-52" />
          <div className="skeleton mt-4 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-3/5" />
        </div>
        <div className="mt-4 rounded-2xl border bg-card p-5 shadow-card">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton mt-4 h-6 w-40" />
        </div>
      </div>
      <p
        role="status"
        className="px-4 pt-6 text-center text-meta text-muted-foreground"
      >
        On ouvre le carnet…
      </p>
    </div>
  );
}
