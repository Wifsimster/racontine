import { createRequire } from "node:module";

/* ===========================================================================
   LA VERSION DU SERVEUR, EN UN SEUL ENDROIT.

   `require` résout `../package.json` aussi bien depuis `src/` (tsx) que depuis
   `dist/` (build) : le fichier est toujours à la racine de `server/`. Ce module
   n'importe rien du reste de l'application — il est donc lisible depuis la
   racine de composition comme depuis un outil, sans cycle d'import.
   =========================================================================== */

const require = createRequire(import.meta.url);

/** Version du serveur, tirée de `server/package.json`. */
export const SERVER_VERSION: string = (
  require("../package.json") as { version: string }
).version;
