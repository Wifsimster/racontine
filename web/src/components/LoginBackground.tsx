export function LoginBackground({
  rulesFrom = 189,
  ruleLeft = "max(1.5rem, calc(50% - 13rem + 1.5rem))",
}: {
  rulesFrom?: number;
  ruleLeft?: string;
}) {
  const veil =
    `linear-gradient(to bottom,` +
    ` transparent calc(var(--safe-t) + ${rulesFrom - 37}px),` +
    ` #000 calc(var(--safe-t) + ${rulesFrom}px),` +
    ` #000 58%, transparent 92%)`;

  const page =
    `linear-gradient(to right,` +
    ` transparent calc(50% - 17rem), #000 calc(50% - 13rem),` +
    ` #000 calc(50% + 13rem), transparent calc(50% + 17rem))`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        data-login-halo
        className="absolute left-1/2 h-56 w-[26rem] -translate-x-1/2 dark:h-44 dark:opacity-75"
        style={{
          top: "calc(var(--safe-t) + 0.5rem)",
          background:
            "radial-gradient(closest-side, var(--primary-soft), transparent)",
        }}
      />

      <div
        className="absolute inset-0"
        style={{ maskImage: page, WebkitMaskImage: page }}
      >
        <div
          data-login-rules
          className="paper-ruled paper-ruled--plain absolute inset-0"
          style={{
            backgroundPosition:
              "0 calc(var(--safe-t) + var(--rule-pitch) - 0.4375rem)",
            maskImage: veil,
            WebkitMaskImage: veil,
          }}
        />
      </div>

      <div
        data-login-margin
        className="absolute inset-y-0 w-[1.5px]"
        style={{ left: ruleLeft, background: "var(--rule-margin)" }}
      />
    </div>
  );
}
