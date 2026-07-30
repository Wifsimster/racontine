import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { Button } from "@/components/ui/button";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `il y a ${days} j`;
}

export default function NotificationsBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  async function refresh() {
    try {
      const res = await api.listNotifications();
      setItems(res.notifications);
      setUnread(res.unread);
    } catch {
      /* silencieux : la cloche n'est pas critique */
    }
  }

  useEffect(() => {
    refresh();
    // Rafraîchissement léger toutes les 60 s pour voir arriver les notifs.
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, []);

  // Ferme le panneau au clic à l'extérieur.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Positionne le panneau en fixe, calé sur la cloche mais borné à la fenêtre.
  // La cloche n'est pas au bord droit de l'écran : un simple `right-0` ancré au
  // bouton faisait déborder le panneau (320 px) hors de l'écran à gauche sur
  // mobile. On calcule donc une position clampée dans le viewport.
  useLayoutEffect(() => {
    if (!open) return;
    function updatePos() {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const margin = 8;
      const panelWidth = Math.min(320, window.innerWidth - 2 * margin);
      // Distance depuis le bord droit du viewport pour aligner le panneau sur
      // le bord droit de la cloche, bornée pour ne pas sortir à gauche ni à droite.
      let right = window.innerWidth - rect.right;
      const maxRight = window.innerWidth - panelWidth - margin;
      right = Math.max(margin, Math.min(right, maxRight));
      setPos({ top: rect.bottom + margin, right });
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  async function onClickItem(n: Notification) {
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
      // En cas d'échec, on annule la mise à jour optimiste : sans ça, le
      // rafraîchissement périodique (60 s) ferait « remonter » le badge de façon
      // déroutante alors que le serveur a toujours la notif comme non lue.
      api.markNotificationRead(n.id).catch(() => {
        setItems((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: n.readAt } : x)),
        );
        setUnread((u) => u + 1);
      });
    }
    setOpen(false);
    if (n.entryId) nav(`/entries/${n.entryId}`);
  }

  async function markAll() {
    setItems((prev) =>
      prev.map((x) =>
        x.readAt ? x : { ...x, readAt: new Date().toISOString() },
      ),
    );
    setUnread(0);
    api.markAllNotificationsRead().catch(() => {});
  }

  return (
    <div ref={panelRef} className="relative">
      <Button
        ref={btnRef}
        variant="ghost"
        size="icon-sm"
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && pos && (
        <div
          style={{ top: pos.top, right: pos.right }}
          className="panel-down fixed z-40 w-80 max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-lift"
        >
          <div className="flex min-h-11 items-center justify-between gap-2 border-b pl-4">
            <span className="text-ui font-bold">Notifications</span>
            {unread > 0 && (
              <Button variant="link" size="sm" onClick={markAll}>
                Tout marquer lu
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              /* État vide dessiné : on nomme ce qui arrivera ici, on ne se
                 contente pas d'un « Aucune notification ». */
              <div className="px-6 py-8 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <Bell className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-ui font-bold">Rien de neuf</p>
                <p className="mt-1 text-meta text-muted-foreground">
                  Vous serez prévenu ici dès qu'une journée est publiée.
                </p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => onClickItem(n)}
                  className={`flex min-h-11 w-full flex-col items-start gap-1 border-b px-4 py-3 text-left transition-colors dur-fast last:border-b-0 hover:bg-accent ${
                    n.readAt ? "" : "bg-primary-soft"
                  }`}
                >
                  <span className="flex w-full items-center gap-2">
                    {!n.readAt && (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-ui font-bold">{n.title}</span>
                  </span>
                  {n.body && (
                    <span className="text-meta text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                  <span className="surtitre text-muted-foreground">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
