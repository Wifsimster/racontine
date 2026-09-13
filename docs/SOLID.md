# Racontine face à SOLID

Note de départ : **2,3 / 5**. Note actuelle : **4,7 / 5**.

Ce document dit comment la note est calculée, ce qu'elle valait avant, ce qui a
changé, et ce qui reste. Il se relit à chaque refonte : une note sans le barème
qui la produit n'est qu'une opinion.

---

## Le barème

Cinq principes, une note sur 5 chacun, moyenne non pondérée. Chaque note repose
sur des faits vérifiables dans le dépôt — un nombre de lignes, un import, un
test qui passe ou qui ne peut pas exister — et jamais sur une impression.

| Note | Ce qu'elle veut dire |
|---|---|
| 1 | Le principe est absent, et son absence coûte (bugs, code intouchable). |
| 2 | Respecté par accident, à quelques endroits. |
| 3 | Respecté là où c'est facile ; les gros morceaux y échappent. |
| 4 | Respecté par défaut ; les exceptions sont nommées et justifiées. |
| 5 | Le principe est tenu par la STRUCTURE : le violer demanderait un effort. |

---

## SRP — une seule raison de changer

### Avant : 2 / 5

| Fichier | Lignes | Responsabilités mêlées |
|---|---:|---|
| `web/src/pages/Review.tsx` | 3 421 | un composant de 1 456 lignes : chargement, sondage, brouillon, publication, rendu |
| `web/src/pages/Timeline.tsx` | 2 009 | requêtes, mise en forme des dates, cartes, visionneuse, états d'erreur |
| `web/src/pages/Capture.tsx` | 1 245 | compression, envoi, panneaux d'état, écrans de remplacement |
| `server/src/ingest.ts` | 897 | validation, disque, SQL, appel du modèle, découpage en journées, notification |
| `server/src/routes/entries.ts` | 524 | HTTP **et** contrôle d'accès, publication, substitution d'un mot tranché, codes d'erreur Postgres |
| `server/src/mcp.ts` | 476 | construction du serveur + cinq outils (schémas, SQL, erreurs) |
| `server/src/routes/sharing.ts` | 367 | HTTP **et** règles du cercle (dernier administrateur, invitations) |

### Après : 4,5 / 5

| Fichier | Avant | Après |
|---|---:|---:|
| `server/src/ingest.ts` | 897 | **51** (façade) |
| `server/src/mcp.ts` | 476 | **34** |
| `server/src/notifications.ts` | 172 | **24** |
| `server/src/routes/entries.ts` | 524 | **242** |
| `server/src/routes/sharing.ts` | 367 | **154** |
| `server/src/routes/attachments.ts` | 172 | **83** |
| `web/src/pages/Review.tsx` | 3 421 | **1 268** |
| `web/src/pages/Timeline.tsx` | 2 009 | **435** |
| `web/src/pages/Capture.tsx` | 1 245 | **612** |
| `web/src/pages/Login.tsx` | 1 004 | **654** |

Le serveur se lit maintenant en couches, chacune avec sa raison de changer :

```
domain/     règles pures        (aucun I/O, aucun framework)
ports.ts    contrats            (ce dont les services ont besoin)
services/   orchestration       (ni SQL, ni HTTP)
adapters/   technique           (Drizzle, disque, Anthropic, SMTP, Web Push)
queries/    lectures            (le côté « consulter », séparé des écritures)
routes/     protocole           (lire une requête, choisir un statut)
composition.ts                  (le seul endroit qui sait qui est branché sur quoi)
```

**Pourquoi pas 5** : `Review.tsx` reste à 1 268 lignes. Son état de donnée est
sorti (`features/review/useReviewEntry.ts`), ses composants aussi (dix
modules dans `features/review/`), mais le rendu d'un écran qui met une photo, un récit, des lectures à
trancher et une décision en regard reste long. C'est la dernière unité du dépôt
qu'on ne lit pas d'une traite.

---

## OCP — ouvert à l'extension, fermé à la modification

### Avant : 2 / 5

Les cinq types de moments d'une journée (repas, sieste, activité, anecdote,
santé) étaient réécrits à **neuf** endroits : deux boucles de conversion dans
`ingest.ts`, un filtre par type dans l'outil MCP, deux tables d'icônes, un
`switch` de résumé, une cascade de `if (item.type === …)`, une table de champs
de formulaire, une liste de types à proposer à l'ajout. Ajouter un sixième type
demandait de retrouver les neuf — c'est-à-dire d'en oublier un.

Même forme ailleurs : les canaux de notification (in-app, e-mail, Web Push)
tenaient dans une seule boucle de `notifications.ts` ; les cinq outils MCP dans
une seule fonction de 400 lignes.

### Après : 5 / 5

| Ce qu'on étend | Où on ajoute | Ce qu'on ne touche pas |
|---|---|---|
| un type de moment | `domain/entry-items.ts` + `web/src/lib/items.tsx` | conversions, outils MCP, journal, relecture, formulaire |
| un canal de notification | une classe + une ligne dans `composition.ts` | l'orchestrateur, le registre in-app, les autres canaux |
| un outil MCP | un fichier dans `mcp/tools/` + une ligne dans son `index.ts` | le constructeur du serveur |
| un moteur de lecture de carnet | une classe implémentant `CarnetReader` | tous les services |

Deux tests verrouillent la promesse : `domain/entry-items.test.ts` vérifie que
l'aller (écrire) et le retour (lire) d'une journée passent par le même registre,
et `notifications/subscriber-notifier.test.ts` branche des canaux inventés de
toutes pièces sur l'orchestrateur sans le modifier.

---

## LSP — une implémentation en vaut une autre

### Avant : 3 / 5

Non applicable faute de sujet : aucune interface, aucune hiérarchie, donc rien à
substituer. `VlmError extends Error` était le seul héritage, correct.

### Après : 4,5 / 5

Chaque port a au moins deux implémentations — la vraie et sa doublure de test —
et les tests passent à l'identique sur les deux : c'est exactement l'épreuve de
substitution. Les garanties délicates sont DANS le contrat, pas dans l'appelant :

- `createIfAbsent` rend `null` si la journée existe déjà (au lieu de lever) ;
- `applyReadingIfProcessing` rend `false` si l'état a changé, et n'écrit rien ;
- `failIfProcessing`, `claimFailedForRetry` : mêmes conditions, mêmes retours.

`FakeEntryRepository` tient ces garanties sans SQL ; `DrizzleEntryRepository`
les tient avec `ON CONFLICT DO NOTHING` et `UPDATE … WHERE status = …`. Aucun
service ne sait laquelle il a en face.

Un piège a été retiré au passage : `VlmError` était une classe jumelle de
l'erreur du domaine ; le service qui rattrape une lecture ratée n'en connaissait
qu'une, et le message écrit pour le parent était remplacé par la phrase
générique. C'est désormais la même classe (`CarnetReadError`).

---

## ISP — des contrats qu'on n'utilise pas entièrement, jamais

### Avant : 2,5 / 5

Personne ne dépendait d'une interface : on dépendait de MODULES entiers.
`ingest.ts` importait `db`, `storage`, `vlm`, `llm-keys`, `notifications`,
`corrections`, `access`, `uncertainties` — soit tout Postgres, tout sharp et
tout le SDK Anthropic pour valider une date.

### Après : 4,5 / 5

Vingt-trois interfaces. Dix-sept d'entre elles ont trois méthodes ou moins ;
la médiane est à deux. Les découpages suivent l'usage réel :

- `EntryRepository` (lecture automatique) et `EntryRevisionRepository`
  (relecture humaine) sont séparés : aucun des deux appelants n'a besoin des
  méthodes de l'autre, et une doublure de test peut porter les deux ;
- `ImageStore` dit « range, relis, efface, tourne » et rien de sharp ;
- `NotificationChannel` a deux méthodes : « es-tu utilisable ? », « livre ».

**Pourquoi pas 5** : deux contrats restent larges. `EntryRepository` porte onze
méthodes — c'est le cycle de vie complet d'une journée, et l'ingestion n'en
utilise que trois ; le découper suivrait l'appelant plutôt que le sujet, comme
on l'a fait pour la relecture (`EntryRevisionRepository`), mais le gain devient
mince. Et `ImageStore` porte `rotate`, dont l'ingestion n'a que faire : un port
de plus pour un seul appelant coûterait davantage qu'il ne rapporte. Arbitrages
assumés, pas des oublis.

---

## DIP — dépendre d'abstractions, pas de détails

### Avant : 1,5 / 5

C'était la faiblesse la plus coûteuse. Dix-sept fichiers importaient `db`
directement, dont toutes les routes et tout le code métier. Aucun point
d'injection nulle part.

La preuve tenait dans les tests eux-mêmes. Leurs noms disaient la contrainte :

```
test("ingestCarnetImages rejette une date mal formée (400) SANS TOUCHER LA BASE")
```

Autrement dit : « ce test ne passe que tant que la validation reste la première
ligne de la fonction ». Tout ce qui venait après — le découpage d'un carnet en
plusieurs journées, la course entre une lecture et une publication, une journée
publiée qu'un lot ne doit pas écraser, un canal de notification en panne —
n'était couvert par rien et ne pouvait pas l'être.

### Après : 5 / 5

Les services ne reçoivent que des ports ; `composition.ts` est le seul fichier
qui connaisse Drizzle, sharp, Anthropic, nodemailer et web-push à la fois.
`testing/fakes.ts` fournit une doublure par port.

| | Avant | Après |
|---|---:|---:|
| Tests serveur | 75 | **146** |
| Tests exécutant du métier sans Postgres | 0 | **71** |

Ce qui se teste maintenant en millisecondes, sans base, sans disque et sans
appel facturé : un carnet couvrant trois jours découpé en trois journées reliées
par un lot ; une journée déjà publiée qu'un lot ne réécrit pas ; une relecture
humaine concurrente qui n'est pas écrasée par la sortie du modèle ; un message
d'erreur du fournisseur qui ne fuit pas vers les proches ; la protection du
dernier administrateur ; une invitation nominative, à usage unique ; la dernière
page d'un carnet qu'on ne retire pas.

---

## Ce que le découpage a corrigé au passage

Trois défauts réels sont tombés en séparant les couches — ils tenaient tous à ce
qu'une règle vivait au mauvais endroit :

1. **La relance d'une lecture ne vérifiait le rôle que dans la route.** La règle
   est maintenant dans le service : tout appelant y est soumis.
2. **La révocation d'une invitation écrivait avant de vérifier l'autorisation.**
   L'ordre est rétabli : on vérifie, puis on écrit.
3. **Une course perdue à la création d'une journée déréférençait une ligne
   absente** (500). Elle rend 409.

---

## Ce qui reste

| Point | Note | Décision |
|---|---|---|
| `Review.tsx`, 1 268 lignes | SRP | Le rendu d'un écran de mise en regard ; découpé autant qu'il est utile. |
| `routes/subscriptions.ts`, `routes/push.ts` | SRP/DIP | CRUD sans règle métier : un service n'ajouterait qu'une indirection. |
| `access.ts`, `settings.ts`, `llm-keys.ts`, `mcp-tokens.ts` | DIP | Ce SONT les adaptateurs de données ; ils sont derrière des ports pour leurs appelants. |
| `EntryRepository` (11 méthodes) | ISP | Le cycle de vie d'une journée ; la relecture a déjà son propre contrat. |
| `ImageStore.rotate` | ISP | Une méthode de trop pour un appelant ; séparer coûterait plus que ça ne rapporte. |

---

## Notes

| Principe | Avant | Après |
|---|---:|---:|
| SRP | 2,0 | 4,5 |
| OCP | 2,0 | 5,0 |
| LSP | 3,0 | 4,5 |
| ISP | 2,5 | 4,5 |
| DIP | 1,5 | 5,0 |
| **Moyenne** | **2,3** | **4,7** |

Vérifiable par `pnpm typecheck && pnpm test && pnpm build` : 146 tests, zéro
échec.
