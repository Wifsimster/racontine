import type { Child, MemberRole } from "./types";

const WRITERS: ReadonlySet<string> = new Set<MemberRole>([
  "admin",
  "contributor",
]);

export function canWrite(role: MemberRole | undefined | null): boolean {
  return !!role && WRITERS.has(role);
}

export function writableChildren(kids: Child[]): Child[] {
  return kids.filter((k) => canWrite(k.role));
}

export function roleMap(kids: Child[]): Map<string, MemberRole> {
  const m = new Map<string, MemberRole>();
  for (const k of kids) if (k.role) m.set(k.id, k.role);
  return m;
}
