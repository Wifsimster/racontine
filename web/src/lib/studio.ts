/* ===========================================================================
   QUI ÉDITE CE CARNET.

   Racontine n'est pas un produit anonyme : il est conçu, développé et hébergé
   par BATTISTELLA, studio indépendant d'une personne. Tant que l'app était
   gratuite et auto-hébergée, ce n'était qu'une question de fierté. À partir du
   moment où l'on demande une carte bancaire, c'est deux choses de plus :

   · une OBLIGATION — en France, l'éditeur d'un service payant s'identifie, et
     ses conditions de vente, sa politique de confidentialité et ses modalités
     de résiliation doivent être accessibles avant le paiement ;
   · la meilleure RÉASSURANCE qu'on ait. « Qui encaisse mon argent, et où vont
     les photos de mon enfant ? » est la question qu'on se pose devant un bouton
     de paiement. Un nom, une adresse, un e-mail et des liens qui fonctionnent y
     répondent mieux que n'importe quelle phrase de vente.

   Les faits vivent ICI, dans un seul objet, pour que le nom et les liens ne
   soient jamais recopiés d'un écran à l'autre.
   =========================================================================== */

export const STUDIO = {
  name: "BATTISTELLA",
  /** Ce qu'il est, en une ligne, tel que le studio se présente. */
  tagline: "studio indépendant · auto-hébergé en France",
  url: "https://pro.battistella.ovh/",
  /** Forme juridique et lieu — ce que la mention légale exige de nommer. */
  legalName: "BATTISTELLA — micro-entreprise",
  city: "Artigues-près-Bordeaux, France",
  email: "battistella@proton.me",
  links: {
    mentions: "https://pro.battistella.ovh/mentions-legales",
    cgv: "https://pro.battistella.ovh/cgv",
    confidentialite: "https://pro.battistella.ovh/confidentialite",
    remboursement: "https://pro.battistella.ovh/remboursement",
  },
} as const;
