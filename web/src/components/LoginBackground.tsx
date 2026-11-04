export function LoginBackground({
  ruleLeft = "max(1.5rem, calc(50% - var(--page-half) + 1.5rem))",
  wide = false,
}: {
  ruleLeft?: string;
  wide?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${wide ? "page-half-wide" : "page-half"}`}
    >
      <div
        data-login-margin
        className="absolute inset-y-0 w-[1.5px]"
        style={{ left: ruleLeft, background: "var(--rule-margin)" }}
      />
    </div>
  );
}
