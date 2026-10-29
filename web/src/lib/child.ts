export function initialOf(name: string): string {
  const first = name.trim().match(/\p{L}/u);
  return first ? first[0].toLocaleUpperCase("fr-FR") : "·";
}

export function ageLabel(
  birthdate: string | null | undefined,
  on?: string | Date,
): string | null {
  if (!birthdate) return null;
  const born = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;

  const at =
    on === undefined
      ? new Date()
      : on instanceof Date
        ? on
        : new Date(`${on}T00:00:00`);
  if (Number.isNaN(at.getTime()) || at < born) return null;

  const days = Math.floor((at.getTime() - born.getTime()) / 86_400_000);
  if (days < 31) {
    if (days < 7) return "nouveau-né";
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }

  let months =
    (at.getFullYear() - born.getFullYear()) * 12 +
    (at.getMonth() - born.getMonth());
  if (at.getDate() < born.getDate()) months -= 1;

  if (months < 24) return months <= 1 ? "1 mois" : `${months} mois`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return `${years} ans`;
  return `${years} ans et ${rest} mois`;
}
