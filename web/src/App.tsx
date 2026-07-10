import { useEffect, useState } from "react";
import { BookOpenText, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";

type Health = { status: string; db: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-svh flex flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <BookOpenText className="size-10 text-primary" />
        <h1 className="text-4xl font-semibold tracking-tight">Racontine</h1>
      </div>
      <p className="text-muted-foreground text-center max-w-md text-balance">
        Le carnet de liaison, dématérialisé — photographiez la journée, on
        s&apos;occupe du reste.
      </p>
      <Button size="lg">
        <Camera />
        Photographier le carnet
      </Button>
      <p className="text-xs text-muted-foreground">
        API : {health ? `${health.status} · db ${health.db}` : "hors ligne"}
      </p>
    </div>
  );
}
