import { useEffect, useState } from "react";
import { BellRing, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { CaptureReminder } from "@/lib/types";
import { enablePush, getPushState, type PushState } from "@/lib/push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { InlineError } from "@/components/PageState";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: 1, short: "L", label: "lundi" },
  { value: 2, short: "M", label: "mardi" },
  { value: 3, short: "M", label: "mercredi" },
  { value: 4, short: "J", label: "jeudi" },
  { value: 5, short: "V", label: "vendredi" },
  { value: 6, short: "S", label: "samedi" },
  { value: 7, short: "D", label: "dimanche" },
] as const;

function daysHint(days: number[]): string {
  const key = days.join(",");
  if (!days.length) return "Aucun jour choisi : le rappel reste muet.";
  if (key === "1,2,3,4,5") return "Du lundi au vendredi.";
  if (key === "1,2,3,4,5,6,7") return "Tous les jours.";
  if (key === "6,7") return "Le week-end.";
  const names = DAYS.filter((d) => days.includes(d.value)).map((d) => d.label);
  const last = names.pop();
  return names.length
    ? `Le ${names.join(", le ")} et le ${last}.`
    : `Le ${last}.`;
}

function PushHint({
  state,
  onEnable,
  busy,
}: {
  state: PushState | null;
  onEnable: () => void;
  busy: boolean;
}) {
  if (state === null || state === "subscribed") return null;
  if (state === "unsubscribed")
    return (
      <div className="flex flex-col gap-2 border-l-2 border-primary py-1 pl-3">
        <p className="max-w-[52ch] text-meta text-pretty">
          Le rappel arrive en notification, sur les appareils où vous les avez
          activées. Pas encore celui-ci.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={busy}
          onClick={onEnable}
        >
          {!busy && <BellRing aria-hidden="true" />}
          Activer les notifications ici
        </Button>
      </div>
    );
  return (
    <p className="max-w-[52ch] border-l-2 border-border py-1 pl-3 text-meta text-pretty text-muted-foreground">
      {state === "denied"
        ? "Les notifications sont bloquées sur cet appareil : autorisez-les dans les réglages du site pour y recevoir le rappel."
        : state === "unavailable"
          ? "Les notifications ne sont pas encore configurées sur ce serveur : le rappel ne partira pas."
          : "Ce navigateur ne reçoit pas de notifications. Activez-les depuis votre téléphone pour recevoir le rappel."}
    </p>
  );
}

function ReminderRow({
  reminder,
  showName,
  push,
  onPushChange,
}: {
  reminder: CaptureReminder;
  showName: boolean;
  push: PushState | null;
  onPushChange: (s: PushState) => void;
}) {
  const [value, setValue] = useState(reminder);
  const [time, setTime] = useState(reminder.time);
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `rappel-${reminder.childId}`;

  async function save(changes: Partial<Pick<CaptureReminder, "enabled" | "time" | "days">>) {
    setBusy(true);
    setError(null);
    const before = value;
    setValue({ ...value, ...changes });
    try {
      const saved = await api.saveCaptureReminder(reminder.childId, changes);
      setValue((v) => ({ ...v, ...saved }));
      setTime(saved.time);
    } catch (e) {
      setValue(before);
      setTime(before.time);
      setError(e instanceof Error ? e.message : "Échec de l'enregistrement");
    } finally {
      setBusy(false);
    }
  }

  async function activatePush() {
    setPushBusy(true);
    setError(null);
    let failure: string | null = null;
    try {
      await enablePush();
    } catch (e) {
      failure = e instanceof Error ? e.message : "Notifications indisponibles";
    }
    try {
      const next = await getPushState();
      onPushChange(next);
      if (failure && next !== "denied") setError(failure);
    } catch {
      onPushChange("unsupported");
    } finally {
      setPushBusy(false);
    }
  }

  async function toggle(enabled: boolean) {
    const pushing =
      enabled && push === "unsubscribed" ? activatePush() : Promise.resolve();
    await save({ enabled });
    await pushing;
  }

  function commitTime() {
    if (time === value.time) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      setTime(value.time);
      return;
    }
    void save({ time });
  }

  function toggleDay(day: number) {
    const days = value.days.includes(day)
      ? value.days.filter((d) => d !== day)
      : [...value.days, day].sort((a, b) => a - b);
    void save({ days });
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={id} className="text-ui font-bold">
            {showName
              ? `Le carnet de ${reminder.childName}`
              : "Me le rappeler"}
          </label>
          <p
            id={`${id}-hint`}
            className="max-w-[52ch] text-meta text-pretty text-muted-foreground"
          >
            {value.enabled
              ? `À ${value.time.replace(":", " h ")}, si aucune journée de ${reminder.childName} n'est arrivée ce jour-là.`
              : `Une notification le soir si la journée de ${reminder.childName} n'a pas encore été envoyée.`}
          </p>
        </div>
        <Toggle
          id={id}
          checked={value.enabled}
          disabled={busy}
          aria-describedby={`${id}-hint`}
          onChange={(v) => void toggle(v)}
        />
      </div>

      {value.enabled && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <label htmlFor={`${id}-heure`} className="w-16 text-ui font-bold">
              Heure
            </label>
            <Input
              id={`${id}-heure`}
              type="time"
              step={300}
              value={time}
              className="w-32"
              data-tabular
              onChange={(e) => setTime(e.target.value)}
              onBlur={commitTime}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTime();
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span id={`${id}-jours`} className="w-16 text-ui font-bold">
                Jours
              </span>
              <div
                role="group"
                aria-labelledby={`${id}-jours`}
                className="flex flex-wrap"
              >
                {DAYS.map((d) => {
                  const on = value.days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      aria-label={d.label}
                      disabled={busy}
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        "relative inline-grid size-11 place-items-center rounded-md text-ui transition-colors dur-fast outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        "after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:transition-colors after:dur-fast",
                        on
                          ? "font-bold text-foreground after:bg-primary"
                          : "text-muted-foreground after:bg-transparent hover:text-foreground",
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-meta text-muted-foreground">
              {daysHint(value.days)}
            </p>
          </div>

          <PushHint
            state={push}
            busy={pushBusy}
            onEnable={() => void activatePush()}
          />
        </>
      )}

      {error && (
        <InlineError>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </InlineError>
      )}
    </li>
  );
}

export default function CaptureReminders() {
  const [reminders, setReminders] = useState<CaptureReminder[] | null>(null);
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    api
      .listCaptureReminders()
      .then((r) => setReminders(r.reminders))
      .catch(() => setReminders([]));
    getPushState()
      .then(setPush)
      .catch(() => setPush("unsupported"));
  }, []);

  if (!reminders?.length) return null;

  return (
    <section className="flex flex-col gap-2 py-6">
      <h2 className="font-serif text-title font-semibold">Rappel du carnet</h2>
      <p className="max-w-[52ch] text-meta text-pretty text-muted-foreground">
        Les proches attendent les journées. Un mot le soir, seulement si rien
        n'est arrivé pour aujourd'hui ; jamais deux fois le même jour.
      </p>
      <ul className="flex flex-col divide-y">
        {reminders.map((r) => (
          <ReminderRow
            key={r.childId}
            reminder={r}
            showName={reminders.length > 1}
            push={push}
            onPushChange={setPush}
          />
        ))}
      </ul>
    </section>
  );
}
