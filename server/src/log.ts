const MASK = "REDACTED";

const SECRET_PARAM = /^(token|secret|key|password|code|hash)$/i;

const SECRET_AFTER = new Set(["token", "magic-link", "reset-password"]);

const SAFE_SEGMENT = new Set(["verify", "send", "callback", "accept"]);

export function redactUrl(url: string): string {
  if (!url) return url;
  try {
    const [rawPath, ...rest] = url.split("?");
    const query = rest.join("?");

    const segments = rawPath.split("/").map((seg, i, all) => {
      const previous = i > 0 ? all[i - 1] : "";
      return seg && SECRET_AFTER.has(previous) && !SAFE_SEGMENT.has(seg)
        ? MASK
        : seg;
    });
    const path = segments.join("/");

    if (!query) return path;

    const params = new URLSearchParams(query);
    for (const name of [...params.keys()])
      if (SECRET_PARAM.test(name)) params.set(name, MASK);
    const rendered = params.toString();
    return rendered ? `${path}?${rendered}` : path;
  } catch {
    return MASK;
  }
}

export function describeFailure(err: unknown): {
  status: number;
  body: { error: string };
  severity: "error" | "warn";
} {
  if (sqlStateOf(err) === "22P02")
    return {
      status: 400,
      body: { error: "identifiant invalide" },
      severity: "warn",
    };

  const status = (err as { statusCode?: unknown })?.statusCode;
  const code = typeof status === "number" ? status : 500;

  if (code >= 500)
    return { status: code, body: { error: "erreur interne" }, severity: "error" };

  const message = (err as { message?: unknown })?.message;
  return {
    status: code,
    body: {
      error:
        typeof message === "string" && message ? message : "requête refusée",
    },
    severity: "warn",
  };
}

function sqlStateOf(err: unknown): string {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return "";
}
