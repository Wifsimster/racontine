import type { DayChip } from "../domain/day-glance.js";

/** Échappe le texte destiné à être interpolé dans du HTML d'e-mail. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ===========================================================================
   L'E-MAIL — la seule surface du produit qui sorte de chez vous.

   Une mamie lectrice ne verra peut-être jamais l'app : elle reçoit un e-mail le
   soir et clique. Cet e-mail était pourtant le seul endroit de Racontine où une
   couleur ne voulait rien dire — `system-ui`, une encre #1f2937 et un bouton
   #4f46e5, l'indigo par défaut de la bibliothèque d'origine. Or dans le
   vocabulaire chromatique du produit, l'indigo VEUT DIRE « sieste ». Le premier
   écran d'un proche ressemblait à un échafaudage qu'on avait oublié de
   repeindre.

   Il porte maintenant le carnet : papier, feuille bordée de son trait de marge
   groseille, encre bleu-nuit, bouton groseille, et la signature du produit en
   pied. Toutes les valeurs viennent des jetons de web/src/index.css.

   TROIS CONTRAINTES PROPRES À L'E-MAIL, qui expliquent les choix d'écriture :

   1. AUCUNE WEBFONT NE CHARGE dans la plupart des clients de messagerie. Le
      titre est donc en Georgia, qui est déjà la police de repli déclarée de
      `--font-serif` : le repli du produit, pas un repli improvisé.
   2. PAS DE FEUILLE DE STYLE. Gmail retire `<style>` ; tout est en style en
      ligne, et la mise en page passe par des tableaux, pas par flex.
   3. LE MODE SOMBRE N'EST PAS PILOTABLE de façon fiable d'un client à l'autre.
      On reste donc en clair, avec des couleurs explicites partout : un fond
      laissé implicite est exactement ce qui produit du texte noir sur noir chez
      les clients qui inversent.

   Enfin l'e-mail montre ce qu'il annonce : la bande de feutres de la journée
   (« 2 repas · sieste 2 h 05 · joyeuse »), dans les mêmes teintes et avec les
   mêmes mots que le journal. Ce n'est pas un ornement — un proche qui lit ça
   dans sa boîte a déjà reçu quelque chose, même s'il ne clique pas ce soir-là.
   =========================================================================== */

/** Les jetons du carnet, en sRGB (web/src/index.css). */
const INK = {
  paper: "#F9F7F2",
  sheet: "#FEFDFA",
  text: "#242846",
  pale: "#5E6276",
  border: "#DBDDE8",
  primary: "#B8284D",
  onPrimary: "#FDFCF7",
  /* Le trait de marge de la marque, sur la tuile. La teinte est le papier à
     50 % sur le groseille, COMPOSÉE À LA MAIN : `opacity` n'est pas fiable d'un
     client de messagerie à l'autre, et une marque à moitié transparente qui
     devient opaque chez Outlook n'est plus la même marque. */
  marginOnTile: "#D990A0",
};

/**
 * Les teintes de la bande, en paires (encre, fond) — les mêmes qu'à l'écran.
 *
 * DEUX FEUTRES, ET UN NEUTRE, et ce n'est pas un oubli : l'humeur n'est pas un
 * type de moment. Le journal le dit explicitement (« l'humeur reste à
 * l'encre ; cette absence de feutre est une information ») et la règle du
 * système l'impose — le prune veut dire « anecdote », il ne peut pas vouloir
 * dire « joyeuse » deux centimètres plus bas.
 */
const FEUTRE = {
  meal: { ink: "#7D4A1E", bg: "#FDE9D4" }, // --meal / --meal-bg
  nap: { ink: "#3F4E97", bg: "#E7ECFF" }, // --nap / --nap-bg
  mood: { ink: "#242846", bg: "#EBECF2" }, // --foreground / --muted
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

/**
 * La marque, en e-mail : une tuile de 24 px dessinée en TABLEAU, pas en image.
 *
 * Un PNG distant serait bloqué par défaut par la plupart des clients (« images
 * non affichées ») — la marque disparaîtrait précisément chez les gens les plus
 * prudents. Deux cellules colorées suffisent à poser la tuile groseille et son
 * trait de marge ; le R, lui, n'y survivrait pas et n'est pas tenté.
 */
function markHtml(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:24px;height:24px;background:${INK.primary};border-radius:6px"><tr>
    <td style="width:6px"></td>
    <td style="width:2px;background:${INK.marginOnTile}"></td>
    <td></td>
  </tr></table>`;
}

/**
 * LA COQUILLE, commune à tous les e-mails du produit : le papier, la marque et
 * son surtitre, la feuille posée sur son trait de marge, la signature.
 *
 * Elle est extraite parce qu'il y a maintenant DEUX sortes d'envois — la
 * journée publiée et les liens de capacité — et que deux gabarits séparés
 * finiraient par diverger. Un e-mail de Racontine doit se reconnaître avant
 * d'être lu, quel que soit ce qu'il annonce.
 */
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

/** Le bouton de l'e-mail : le seul groseille plein du message. */
function buttonHtml(link: string, label: string): string {
  return `<a href="${encodeURI(link)}" style="display:inline-block;padding:12px 22px;background:${INK.primary};color:${INK.onPrimary};border-radius:16px;font-size:15px;font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;
}

/**
 * Le gabarit, isolé de l'envoi : c'est ce qui le rend testable (voir
 * `notifications.test.ts`). Un e-mail qui repart en #4f46e5 ou qui cesse
 * d'échapper un prénom doit faire rougir la CI, pas se découvrir dans la boîte
 * de réception d'une grand-mère.
 */
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

  // La version TEXTE est un vrai repli, pas un pense-bête : elle porte la même
  // bande de feutres, en toutes lettres.
  const glance = chips.map((c) => c.label).join(" \u00b7 ");
  const text =
    `${greeting}\n\n${body}\n` +
    (glance ? `\n${glance}\n` : "") +
    `\nOuvrir la journée : ${link}\n\n\u2014 Propulsé par Racontine`;

  // childName (donc title/body), le nom du destinataire et l'humeur sont saisis
  // par des utilisateurs ou écrits par le modèle : on les échappe avant
  // interpolation HTML pour éviter toute injection de balises (liens de
  // phishing, images traçantes…). `link` est une URL construite côté serveur.
  const html = shell(`            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${INK.pale}">${escapeHtml(day.dateLabel)}</p>
            <p style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:28px;font-weight:600;color:${INK.text}">La journée de ${escapeHtml(day.childName)}</p>
            ${chipsHtml(chips)}
            <p style="margin:0 0 8px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(greeting)}</p>
            <p style="margin:0 0 18px;font-size:16px;line-height:26px;color:${INK.text}">${escapeHtml(body)}</p>
            ${buttonHtml(link, "Ouvrir la journée")}`);

  return { text, html };
}

/* ===========================================================================
   LES E-MAILS DE LIEN — connexion, mot de passe, invitation.

   Ces trois envois partaient en TEXTE BRUT : un objet, une URL nue, et rien
   d'autre. C'est le premier contact de Racontine avec un proche invité, et
   c'était aussi le message le plus facile à imiter du produit — un lien nu
   dans une boîte de réception ne se distingue d'un hameçonnage que par la
   confiance qu'on accorde à l'expéditeur. Or celui qui reçoit un lien de
   CONNEXION est précisément celui qui n'a encore jamais vu l'app : il n'a que
   cet e-mail pour décider s'il clique.

   Ils portent donc la même coquille que la journée publiée, et disent trois
   choses : d'où vient le message, ce que le lien fait, et combien de temps il
   vaut. La version texte reste rendue depuis la MÊME source — deux versions
   écrites séparément finissent toujours par se contredire.

   Ce qu'ils ne font pas, et c'est délibéré : aucune image distante (elle
   serait bloquée, et la marque disparaîtrait chez les plus prudents), aucun
   pixel de suivi, et jamais l'URL en toutes lettres dans le corps HTML — elle
   est sur le bouton, et rappelée en texte pour les clients qui n'en veulent
   pas.
   =========================================================================== */

/** Les trois liens de capacité que le produit envoie. */
export type LinkKind = "connexion" | "mot-de-passe" | "invitation";

/**
 * Ce que chaque lien dit. Un seul endroit : l'objet, le titre, la phrase, le
 * bouton et la durée de validité d'un même envoi ne peuvent pas se répondre
 * de trois fichiers différents.
 */
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

/** La phrase qui vaut pour les trois : ces URL SONT des identifiants. */
const PERSONNEL = "Ce lien est personnel : ne le transmettez à personne.";

/**
 * L'e-mail d'un lien de capacité, dans les deux versions. `url` est construite
 * par le serveur ; elle n'est jamais écrite dans le corps HTML, seulement
 * portée par le bouton (et rappelée en texte).
 */
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
