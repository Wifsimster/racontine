import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  ScrollRestoration,
  useLocation,
} from "react-router-dom";
import {
  BookOpenText,
  ChartLine,
  CreditCard,
  LogOut,
  Menu,
  Settings,
  Share2,
  ShieldCheck,
  CircleUser,
  Users,
  X,
} from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import NotificationsBell from "@/components/NotificationsBell";
import { Marque } from "@/components/Marque";
import { StudioSignature } from "@/components/Studio";
import { useBilling } from "@/lib/billing";
import Bienvenue from "@/pages/Bienvenue";

type NavItem = {
  to: string;
  label: string;
  short: string;
  icon: typeof BookOpenText;
};

export default function App() {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appName, setAppName] = useState("Racontine");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { billing } = useBilling(Boolean(session));

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    api
      .me()
      .then((me) => {
        setIsOwner(me.isOwner);
        setIsAdmin(me.isAdmin);
      })
      .catch(() => {
        setIsOwner(false);
        setIsAdmin(false);
      });
    api
      .publicSettings()
      .then((s) => setAppName(s.appName))
      .catch(() => {});
  }, [userId]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

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
    if (location.pathname === "/") return <Bienvenue />;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const items: NavItem[] = [
    { to: "/", label: "Le journal", short: "Journal", icon: BookOpenText },
    { to: "/tendances", label: "Tendances", short: "Tendances", icon: ChartLine },
    { to: "/proches", label: "Les proches", short: "Proches", icon: Users },
    { to: "/partage", label: "Partager", short: "Partager", icon: Share2 },
    { to: "/compte", label: "Mon compte", short: "Compte", icon: CircleUser },
  ];
  if (billing?.enabled) {
    items.push({
      to: "/abonnement",
      label: "L'abonnement",
      short: "Abonnement",
      icon: CreditCard,
    });
  }
  if (isAdmin) {
    items.push({
      to: "/administration",
      label: "Administration",
      short: "Administration",
      icon: ShieldCheck,
    });
  }
  if (isOwner) {
    items.push({
      to: "/reglages",
      label: "Réglages",
      short: "Réglages",
      icon: Settings,
    });
  }

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const logout = () =>
    signOut().then(() => (window.location.href = "/login"));

  return (
    <div className="min-h-svh">
      <a
        href="#contenu"
        className="fixed top-2 left-4 z-60 print:hidden -translate-y-24 rounded-xl bg-card px-4 py-3 text-ui font-bold text-foreground shadow-lift transition-transform dur-slow ease-page focus-visible:translate-y-0"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-50 border-b print:hidden bg-surface-bar px-safe pt-safe backdrop-blur-md">
        <div className="shell-width flex h-header items-center justify-between gap-2 px-4 lg:max-w-[64rem] lg:gap-6 lg:px-10">
          <Link
            to="/"
            className="-ml-1 flex min-h-11 min-w-0 items-center gap-2 rounded-xl px-1 transition-colors dur-fast hover:bg-accent"
          >
            <Marque />
            <span className="truncate font-serif text-title font-semibold">
              {appName}
            </span>
          </Link>
          <nav
            aria-label="Navigation principale"
            className="hidden shrink-0 items-center justify-end lg:flex"
          >
            {items.map(({ to, short }) => (
              <Link
                key={to}
                to={to}
                aria-current={isActive(to) ? "page" : undefined}
                className="relative flex min-h-11 items-center rounded-md px-2 text-ui whitespace-nowrap text-muted-foreground transition-colors dur-fast after:absolute after:inset-x-2 after:bottom-1 after:h-0.5 after:rounded-full hover:text-foreground aria-[current=page]:font-bold aria-[current=page]:text-foreground aria-[current=page]:after:bg-primary"
              >
                <span className="grid">
                  <span className="col-start-1 row-start-1">{short}</span>
                  <span
                    aria-hidden="true"
                    className="invisible col-start-1 row-start-1 font-bold"
                  >
                    {short}
                  </span>
                </span>
              </Link>
            ))}
            <button
              type="button"
              onClick={logout}
              title="Se déconnecter"
              className="ml-1 grid size-11 place-items-center rounded-full text-muted-foreground transition-colors dur-fast hover:bg-accent hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="sr-only">Se déconnecter</span>
            </button>
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsBell />
            <Button
              ref={menuButtonRef}
              className="lg:hidden"
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
            className="fixed inset-0 z-30 bg-overlay lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            id="menu-principal"
            aria-label="Navigation principale"
            className="panel-down fixed inset-x-0 top-header z-40 px-safe lg:hidden"
          >
            <div className="shell-width px-4">
              <div className="mt-2 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lift">
                <ul className="flex flex-col">
                  {items.map(({ to, label, icon: Icon }) => (
                    <li key={to}>
                      <Link
                        to={to}
                        aria-current={isActive(to) ? "page" : undefined}
                        className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-body text-foreground transition-colors dur-fast hover:bg-accent aria-[current=page]:font-bold aria-[current=page]:text-primary"
                      >
                        <Icon className="size-5 shrink-0" aria-hidden="true" />
                        {label}
                      </Link>
                    </li>
                  ))}
                  <li className="mt-1 border-t pt-1">
                    <button
                      type="button"
                      onClick={logout}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-body text-foreground transition-colors dur-fast hover:bg-accent"
                    >
                      <LogOut className="size-5 shrink-0" aria-hidden="true" />
                      Se déconnecter
                    </button>
                  </li>
                </ul>

                <div className="flex flex-col gap-0.5 px-3 pt-2 pb-1">
                  <p className="text-meta text-muted-foreground">
                    {appName} · version {__APP_VERSION__}
                  </p>
                  <StudioSignature />
                </div>
              </div>
            </div>
          </nav>
        </>
      )}

      <main
        id="contenu"
        key={location.pathname}
        className="page-enter pb-safe px-safe"
      >
        <Outlet />
      </main>

      <ScrollRestoration getKey={(location) => location.pathname} />
    </div>
  );
}

function AppSplash() {
  return (
    <div className="min-h-svh bg-background">
      <div className="border-b px-safe pt-safe">
        <div className="shell-width flex h-header items-center gap-2 px-4">
          <Marque />
          <span className="font-serif text-title font-semibold">Racontine</span>
        </div>
      </div>
      <div className="px-4 pt-6" aria-hidden="true">
        <div className="skeleton h-4 w-28" />
        <div className="mt-6 rounded-xl border bg-card p-5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-4 h-6 w-52" />
          <div className="skeleton mt-4 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-full" />
          <div className="skeleton mt-3 h-4 w-3/5" />
        </div>
        <div className="mt-4 rounded-xl border bg-card p-5">
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
