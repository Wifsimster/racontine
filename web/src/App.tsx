import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { BookOpenText, LogOut, Users, Share2 } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import NotificationsBell from "@/components/NotificationsBell";

export default function App() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

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
          <span className="text-lg font-semibold tracking-tight">Racontine</span>
        </Link>
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Button variant="ghost" size="icon-sm" aria-label="Partager" asChild>
            <Link to="/partage">
              <Share2 />
            </Link>
          </Button>
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
    </div>
  );
}
