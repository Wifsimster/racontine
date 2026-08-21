/**
 * Le gabarit d'e-mail de Racontine — « le carnet, par la poste ».
 *
 * Jusqu'ici, chaque envoi bricolait son propre corps : le magic link et
 * l'invitation partaient en texte brut (un lien nu, sans un mot de l'app qui
 * l'envoie), et la notification de journée publiée portait une <div> HTML
 * écrite à la main, avec un indigo (#4f46e5) qui n'existe nulle part dans le
 * produit. Un proche qui reçoit un lien de connexion doit RECONNAÎTRE d'où il
 * vient : c'est ce qui distingue une invitation d'un hameçonnage.
 *
 * Ce module rend donc TOUS les e-mails, à partir d'un même contenu structuré,
 * dans les deux versions (texte et HTML) — elles ne peuvent plus diverger,
 * puisqu'elles sont écrites depuis la même source.
 *
 * Les contraintes du support, qui expliquent la forme du HTML ci-dessous :
 *
 * · Les clients de messagerie ne connaissent ni les variables CSS, ni les
 *   feuilles externes, ni les polices auto-hébergées. La palette de
 *   `web/src/index.css` est donc RECOPIÉE ici en hexadécimal (les valeurs sont
 *   rappelées en commentaire à côté de leur jeton d'origine), et les polices
 *   du produit — Fraunces pour les titres, Nunito pour le texte — ne sont que
 *   la tête d'une pile de repli : c'est le serif système qui rendra chez la
 *   plupart des destinataires, et c'est très bien, la FORME reste la même.
 * · La mise en page passe par des tableaux et des styles en ligne : c'est le
 *   seul dialecte que rendent Outlook et Gmail de la même façon.
 * · Le mode sombre ne peut pas s'appuyer sur les styles en ligne (ils
 *   gagneraient toujours) : les surfaces portent aussi une CLASSE, et un bloc
 *   `@media (prefers-color-scheme: dark)` les repeint en `!important` pour les
 *   clients qui l'honorent (Apple Mail, iOS). Ailleurs, la version claire
 *   s'affiche, complète et lisible.
 * · Aucune image, aucun pixel espion, rien à charger : l'e-mail est entier
 *   dès l'ouverture, même hors ligne, et ne signale pas sa lecture.
 *
 * Les paires posées ici sont MESURÉES, comme celles du produit (règle : >= 5,1:1
 * dans les deux thèmes) — clair, puis nuit :
 *   · encre sur la feuille       14,1:1 / 13,2:1
 *   · encre pâlie sur la feuille  5,9:1 /  6,3:1
 *   · nom de l'instance sur papier 5,7:1 /  7,1:1
 *   · texte du bouton sur groseille 5,9:1 / 7,1:1
 *
 * Le module est PUR (aucun import, aucun accès base ou réseau) : il se teste
 * seul et ne peut pas faire échouer un envoi.
 */

/** Palette claire — jetons de `web/src/index.css`, en hex pour les e-mails. */
const LIGHT = {
  page: "#f9f7f2", // --background · papier
  card: "#fefdfa", // --card · la feuille
  ink: "#242846", // --foreground · encre bleu-nuit
  muted: "#5e6276", // --muted-foreground · encre pâlie
  border: "#dbdde8", // --border · le filet
  rule: "#dbdef1", // --rule · la ligne du cahier
  margin: "#e2a8b5", // --rule-margin composé sur --card · le trait de marge
  primary: "#b8284d", // --primary · groseille
  onPrimary: "#fdfcf7", // --primary-foreground
} as const;

/** Palette sombre — mêmes jetons, variant `dark` de `web/src/index.css`. */
const DARK = {
  page: "#10121d",
  card: "#1d202c",
  ink: "#ebe8df",
  muted: "#9fa0ae",
  border: "#41444e", // --border (blanc 16 %) composé sur --card
  rule: "#333748",
  margin: "#7b4a58",
  primary: "#ee7d8d",
  onPrimary: "#10121d",
} as const;

/** Les deux piles de polices : la tête est celle du produit, le reste est du repli. */
const SERIF =
  "Fraunces,'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif";
const SANS =
  "Nunito,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/** Échappe un texte destiné à être interpolé dans du HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * N'accepte comme cible de lien que http(s). Les URL de Racontine sont
 * construites côté serveur, mais un gabarit qui pose un `href` ne doit pas
 * pouvoir devenir un vecteur (`javascript:`, `data:`) si un appelant futur lui
 * passe une valeur venue d'ailleurs. Renvoie null si l'URL n'est pas sûre :
 * l'appelant retombe alors sur le texte, jamais sur un lien douteux.
 */
export function safeHref(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return encodeURI(url);
}

export type EmailContent = {
  /** Nom de l'instance (réglage `appName`) — l'en-tête et la signature. */
  appName: string;
  /** Titre de l'e-mail, repris dans le sujet par l'appelant. */
  title: string;
  /** « Bonjour Camille, » — omis si le destinataire n'a pas de nom. */
  greeting?: string;
  /** Le corps, un paragraphe par entrée. Texte brut : échappé ici. */
  paragraphs: string[];
  /** L'action, s'il y en a une. */
  action?: { label: string; url: string };
  /**
   * La ligne sous le bouton : à quoi sert ce lien, ce qu'il ne faut pas en
   * faire. C'est là qu'on dit qu'un lien de connexion est personnel.
   */
  note?: string;
  /** Résumé affiché par les clients avant l'ouverture (défaut : 1er paragraphe). */
  preheader?: string;
};

export type RenderedEmail = { text: string; html: string };

/** Rendu texte : la même chose, sans mise en forme — jamais un corps vide. */
function renderText(c: EmailContent): string {
  const lines: string[] = [];
  if (c.greeting) lines.push(c.greeting, "");
  lines.push(...c.paragraphs.flatMap((p) => [p, ""]));
  if (c.action) lines.push(`${c.action.label} : ${c.action.url}`, "");
  if (c.note) lines.push(c.note, "");
  lines.push(`— ${c.appName}, le journal de l'enfance`);
  return lines.join("\n");
}

/** Le bouton d'action, en tableau : la seule forme qu'Outlook rend correctement. */
function renderButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
              <tr>
                <td class="r-btn" style="background:${LIGHT.primary};border-radius:12px">
                  <a href="${href}" class="r-btn-a" style="display:inline-block;padding:13px 24px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:700;color:${LIGHT.onPrimary};text-decoration:none">${escapeHtml(label)}</a>
                </td>
              </tr>
            </table>`;
}

/**
 * Rend un e-mail complet : la feuille du carnet, son trait de marge groseille,
 * le titre en serif souligné d'une réglure, le texte, l'action.
 */
export function renderEmail(content: EmailContent): RenderedEmail {
  const text = renderText(content);
  const appName = escapeHtml(content.appName);
  const preheader = escapeHtml(
    content.preheader ?? content.paragraphs[0] ?? content.title,
  );
  const href = content.action ? safeHref(content.action.url) : null;

  const body = content.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${SANS};font-size:17px;line-height:28px;color:${LIGHT.ink}" class="r-ink">${escapeHtml(p)}</p>`,
    )
    .join("\n            ");

  // Si l'URL n'est pas rendable en lien (cas défensif), on l'écrit en clair :
  // le destinataire doit pouvoir agir, même sans bouton.
  const action = content.action
    ? href
      ? renderButton(content.action.label, href)
      : `<p style="margin:24px 0 8px;font-family:${SANS};font-size:15px;line-height:24px;color:${LIGHT.ink}" class="r-ink">${escapeHtml(`${content.action.label} : ${content.action.url}`)}</p>`
    : "";

  const note = content.note
    ? `<p style="margin:16px 0 0;font-family:${SANS};font-size:14px;line-height:22px;color:${LIGHT.muted}" class="r-muted">${escapeHtml(content.note)}</p>`
    : "";

  const greeting = content.greeting
    ? `<p style="margin:0 0 16px;font-family:${SANS};font-size:17px;line-height:28px;color:${LIGHT.ink}" class="r-ink">${escapeHtml(content.greeting)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
    <title>${escapeHtml(content.title)}</title>
    <style>
      /* Les styles en ligne portent le thème clair ; ce bloc repeint les mêmes
         surfaces pour la nuit, chez les clients qui honorent la requête média.
         Le drapeau !important est nécessaire : sans lui, le style en ligne gagne. */
      @media (prefers-color-scheme: dark) {
        .r-page { background: ${DARK.page} !important; }
        .r-card { background: ${DARK.card} !important; border-color: ${DARK.border} !important; border-left-color: ${DARK.margin} !important; }
        .r-ink { color: ${DARK.ink} !important; }
        .r-muted, .r-foot { color: ${DARK.muted} !important; }
        .r-title { color: ${DARK.ink} !important; border-bottom-color: ${DARK.rule} !important; }
        .r-wordmark { color: ${DARK.primary} !important; }
        .r-btn { background: ${DARK.primary} !important; }
        .r-btn-a { color: ${DARK.onPrimary} !important; }
      }
      @media (max-width: 600px) {
        .r-card { padding: 24px 20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${LIGHT.page}" class="r-page">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preheader}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${LIGHT.page}" class="r-page">
      <tr>
        <td align="center" style="padding:24px 12px 40px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%;max-width:560px">
            <tr>
              <td style="padding:4px 4px 12px;font-family:${SERIF};font-size:20px;line-height:28px;font-weight:600;color:${LIGHT.primary}" class="r-wordmark">${appName}</td>
            </tr>
            <tr>
              <td style="background:${LIGHT.card};border:1px solid ${LIGHT.border};border-left:3px solid ${LIGHT.margin};border-radius:16px;padding:32px 28px" class="r-card">
                <h1 style="margin:0 0 20px;padding:0 0 12px;border-bottom:1px solid ${LIGHT.rule};font-family:${SERIF};font-size:23px;line-height:32px;font-weight:600;color:${LIGHT.ink}" class="r-title">${escapeHtml(content.title)}</h1>
            ${greeting}
            ${body}
            ${action}
            ${note}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 4px 0;font-family:${SANS};font-size:13px;line-height:20px;color:${LIGHT.muted}" class="r-foot">— ${appName}, le journal de l'enfance</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}
