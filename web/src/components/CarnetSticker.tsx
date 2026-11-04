import { cn } from "@/lib/utils";

export function CarnetSticker({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-block h-28 w-32", className)}
    >
      <span className="absolute inset-y-1 left-3 w-24 -rotate-6 rounded-r-xl rounded-l-md bg-primary shadow-card">
        <span className="absolute inset-y-0 left-2 w-1 bg-black/15" />
        <span className="font-hand absolute top-4 left-4 w-10 rounded-md bg-polaroid py-0.5 text-center text-base leading-5 text-primary">
          ♡
        </span>
      </span>
      <span className="paper-ruled paper-ruled--plain absolute top-6 right-0 h-20 w-[4.5rem] rotate-6 rounded-sm bg-polaroid shadow-card [--rule-pitch:0.75rem]" />
      <span className="tape tape-blue absolute top-6 right-3 w-12 rotate-6" />
      <svg
        viewBox="0 0 40 40"
        className="absolute -right-1 bottom-0 size-7 text-spark"
      >
        <path
          d="M20 2 L24 16 L38 20 L24 24 L20 38 L16 24 L2 20 L16 16Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
