import { LoginBackground } from "@/components/LoginBackground";
import { MarqueSignature } from "@/components/Marque";

export function DoorPage({
  intro,
  children,
}: {
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate min-h-svh overflow-hidden pt-safe pb-safe">
      <LoginBackground wide />
      <div className="rise-enter mx-auto flex w-full max-w-[26rem] flex-col pt-[5.25rem] pr-5 pb-6 pl-10 lg:grid lg:max-w-[64rem] lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-16 lg:px-10 lg:pt-32 lg:pb-16 xl:gap-x-24">
        <div className="lg:col-start-1 lg:row-start-1 lg:pt-4">{intro}</div>
        <div className="flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-mt-7">
          {children}
        </div>
        <div className="lg:col-start-1 lg:row-start-2 lg:self-start">
          <MarqueSignature className="mt-8 lg:mt-6" />
        </div>
      </div>
    </div>
  );
}

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
      <h1 className="mt-4 font-serif text-display font-semibold text-foreground lg:text-[3.25rem] lg:leading-[1.05]">
        {appName}
      </h1>
      <p className="carnet-story mt-4 text-foreground lg:max-w-[22ch] lg:text-[1.375rem] lg:leading-9">
        {children}
      </p>
    </>
  );
}

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
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-[1.5px]"
        style={{ background: "var(--rule-margin)" }}
      />
      {children}
    </div>
  );
}

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
