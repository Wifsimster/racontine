import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { BookOpenText, LogOut, Users, Share2, Settings } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import NotificationsBell from "@/components/NotificationsBell";

export default function App() {
  const { data: session, isPending } = useSession();
  const location = useLocation();
  const [isOwner, setIsOwner] = useState(false);
  const [appName, setAppName] = useState("Racontine");

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

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <BookOpenText className="size-6 text-primary" />
          <span className="font-serif text-xl font-semibold tracking-tight">
            {appName}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Button variant="ghost" size="icon-sm" aria-label="Partager" asChild>
            <Link to="/partage">
              <Share2 />
            </Link>
          </Button>
          {isOwner && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Réglages"
              asChild
            >
              <Link to="/reglages">
                <Settings />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Proches & notifications"
            asChild
          >
            <Link to="/proches">
              <Users />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Se déconnecter"
            onClick={() =>
              signOut().then(() => (window.location.href = "/login"))
            }
          >
            <LogOut />
          </Button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        v{__APP_VERSION__}
      </footer>
    </div>
  );
}
