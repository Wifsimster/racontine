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
  ChevronRight,
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
  icon: typeof BookOpenText;
  hint: string;
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
  if (billing?.enabled) {
    items.push({
      to: "/abonnement",
      label: "L'abonnement",
      icon: CreditCard,
      hint: billing.access.open
        ? "L'offre du foyer, et son échéance"
        : "Rouvrir le carnet à l'écriture",
    });
  }
  if (isAdmin) {
    items.push({
      to: "/administration",
      label: "Administration",
      icon: ShieldCheck,
      hint: "Les carnets, les rôles, les invitations",
    });
  }
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
            <Marque />
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

                <div className="flex flex-col gap-0.5 px-4 pt-2 pb-1">
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
