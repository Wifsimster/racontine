import type { DayChip } from "../domain/day-glance.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const INK = {
  paper: "#F9F7F2",
  sheet: "#FEFDFA",
  text: "#242846",
  pale: "#5E6276",
  border: "#DBDDE8",
  primary: "#B8284D",
  onPrimary: "#FDFCF7",
  marginOnTile: "#D990A0",
};

const FEUTRE = {
  meal: { ink: "#7D4A1E", bg: "#FDE9D4" },
  nap: { ink: "#3F4E97", bg: "#E7ECFF" },
  mood: { ink: "#242846", bg: "#EBECF2" },
} as const;

function chipsHtml(chips: DayChip[]): string {
  if (chips.length === 0) return "";
  const cells = chips
    .map(
      (c) =>
        `<td style="background:${FEUTRE[c.tone].bg};color:${FEUTRE[c.tone].ink};border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;white-space:nowrap">${escapeHtml(c.label)}</td>`,
    )
    .join('<td style="width:6px"></td>');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px"><tr>${cells}</tr></table>`;
}

function markHtml(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:24px;height:24px;background:${INK.primary};border-radius:6px"><tr>
    <td style="width:6px"></td>
    <td style="width:2px;background:${INK.marginOnTile}"></td>
    <td></td>
  </tr></table>`;
}

function shell(feuille: string): string {
  return `<div style="margin:0;padding:24px 12px;background:${INK.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK.text}">
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:480px;margin:0 auto">
    <tr><td style="padding-bottom:14px">
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td style="vertical-align:middle">${markHtml()}</td>
        <td style="vertical-align:middle;padding-left:10px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">Carnet de liaison</td>
      </tr></table>
    </td></tr>

    <tr><td>
      <!-- La feuille : bord gauche carré, posé sur son trait de marge
           groseille — la même géométrie que la feuille de l'écran de
           connexion, où une page est reliée du côté de la couture. -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
        <tr>
          <td style="width:3px;background:${INK.primary}"></td>
          <td style="background:${INK.sheet};border:1px solid ${INK.border};border-left:0;border-radius:0 16px 16px 0;padding:20px">
${feuille}
          </td>
        </tr>
      </table>
    </td></tr>

    <tr><td style="padding-top:16px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">Propulsé par Racontine</td></tr>
  </table>
</div>`;
}

function buttonHtml(link: string, label: string): string {
  return `<a href="${encodeURI(link)}" style="display:inline-block;padding:12px 22px;background:${INK.primary};color:${INK.onPrimary};border-radius:16px;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

export function renderEntryEmail(params: {
  greeting: string;
  body: string;
  link: string;
  childName: string;
  dateLabel: string;
  chips: DayChip[];
}): { text: string; html: string } {
  const { greeting, body, link, childName, dateLabel, chips } = params;
  const day = { childName, dateLabel };

  const glance = chips.map((c) => c.label).join(" \u00b7 ");
  const text =
    `${greeting}\n\n${body}\n` +
    (glance ? `\n${glance}\n` : "") +
    `\nOuvrir la journée : ${link}\n\n\u2014 Propulsé par Racontine`;

  const html = shell(`            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">${escapeHtml(day.dateLabel)}</p>
            <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;font-weight:600;color:${INK.text}">La journée de ${escapeHtml(day.childName)}</p>
            ${chipsHtml(chips)}
            <p style="margin:0 0 8px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(body)}</p>
            ${buttonHtml(link, "Ouvrir la journée")}`);

  return { text, html };
}

export type LinkKind = "connexion" | "mot-de-passe" | "invitation";

const LIENS: Record<
  LinkKind,
  { title: string; body: string; button: string; validity: string }
> = {
  connexion: {
    title: "Votre lien de connexion",
    body: "Ce lien vous ouvre le carnet directement, sans mot de passe à retenir.",
    button: "Ouvrir le carnet",
    validity: "Il ne sert qu'une fois, et expire dans quelques minutes.",
  },
  "mot-de-passe": {
    title: "Choisir un nouveau mot de passe",
    body: "Vous avez demandé à réinitialiser votre mot de passe : ce lien mène à l'écran qui en choisit un nouveau.",
    button: "Choisir un mot de passe",
    validity:
      "Il vaut une heure. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable.",
  },
  invitation: {
    title: "Vous êtes invité·e à suivre un enfant",
    body: "Quelqu'un partage avec vous le journal d'un enfant : ses journées, écrites à partir des pages du carnet de liaison. Rien à installer, rien à payer.",
    button: "Voir le journal",
    validity: "L'invitation vous attend quelques jours.",
  },
};

const PERSONNEL = "Ce lien est personnel : ne le transmettez à personne.";

export function renderLinkEmail(params: {
  kind: LinkKind;
  url: string;
}): { text: string; html: string } {
  const { kind, url } = params;
  const l = LIENS[kind];

  const text =
    `${l.title}\n\n${l.body}\n\n${l.button} : ${url}\n\n` +
    `${l.validity}\n${PERSONNEL}\n\n— Propulsé par Racontine`;

  const html = shell(`            <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;font-weight:600;color:${INK.text}">${escapeHtml(l.title)}</p>
            <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(l.body)}</p>
            ${buttonHtml(url, l.button)}
            <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${INK.pale}">${escapeHtml(l.validity)}</p>
            <p style="margin:6px 0 0;font-size:13px;line-height:20px;color:${INK.pale}">${escapeHtml(PERSONNEL)}</p>`);

  return { text, html };
}
