import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { BookOpenText, LogOut } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

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
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Se déconnecter"
          onClick={() => signOut().then(() => (window.location.href = "/login"))}
        >
          <LogOut />
        </Button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
