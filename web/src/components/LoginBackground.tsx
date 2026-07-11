const BLOBS = [
  { color: "var(--meal-bg)", size: 26, top: "8%", left: "12%", duration: 22, delay: 0 },
  { color: "var(--nap-bg)", size: 34, top: "62%", left: "6%", duration: 26, delay: -6 },
  { color: "var(--activity-bg)", size: 20, top: "18%", left: "78%", duration: 19, delay: -3 },
  { color: "var(--anecdote-bg)", size: 30, top: "72%", left: "82%", duration: 24, delay: -12 },
  { color: "var(--health-bg)", size: 22, top: "42%", left: "48%", duration: 28, delay: -8 },
];

export function LoginBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden paper-ruled"
    >
      {BLOBS.map((blob, i) => (
        <span
          key={i}
          className="absolute rounded-full blur-3xl opacity-60 animate-login-drift"
          style={{
            width: `${blob.size}rem`,
            height: `${blob.size}rem`,
            top: blob.top,
            left: blob.left,
            background: blob.color,
            animationDuration: `${blob.duration}s`,
            animationDelay: `${blob.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
