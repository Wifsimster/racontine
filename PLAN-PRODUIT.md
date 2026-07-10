# Racontine — Journal numérique de l'enfance, alimenté par le carnet de liaison

> Photographie le carnet de la nounou → le LLM structure la journée → un journal privé, self-hosted, partagé avec les proches.

---

## 1. Nom de l'application

### Choix recommandé : **Racontine**
- **Sens** : contraction de *raconter* + *comptine*. Évoque « raconter la journée de l'enfant », doux et enfantin sans être niais.
- **Disponibilité (pré-vérifiée le 2026-07-10)** : aucune app mobile ni SaaS trouvée sous ce nom. Le terme « racontines » est utilisé par des médiathèques pour des séances de lecture — usage générique, pas une marque concurrente sur notre classe.
- **Prononçable** en FR et acceptable à l'international (« rah-kon-teen »).

### Alternatives (par ordre de préférence)
| Nom | Idée | Risque |
|---|---|---|
| **Nounote** | nounou + note | Trop centré « nounou » alors que le produit couvre aussi crèche/MAM/maison |
| **Petites Lignes** | les lignes manuscrites du carnet | Joli mais long, domaine dur à obtenir |
| **Papoto** | papoter la journée | Sonorité proche d'apps parentales existantes, à re-vérifier |

### Écartés après recherche
- **Plume** — pris ([plume-app.co](https://plume-app.co/), app d'écriture pour enfants 7-13 ans, France).
- **Nidou** — confusion probable avec [Nidouyé](https://www.nidouye.fr/) (mise en relation nounous/familles).

### Vérifications à faire avant de graver le nom
- [ ] Recherche INPI (marques, classes 9, 42, 45) : https://data.inpi.fr
- [ ] Domaines : `racontine.fr` / `racontine.app` (le `.app` force HTTPS, bon signal)
- [ ] App Store / Play Store (si app mobile un jour)
- [ ] Handles réseaux sociaux si diffusion au-delà du cercle privé

---

## 2. Plan Product-Market Fit

### 2.1 Le problème
Les journées des jeunes enfants gardés hors du domicile (nounou, MAM, crèche) sont consignées **sur papier** dans un carnet de liaison : repas, siestes, humeur, activités, anecdotes. Ce carnet :
1. **N'est lisible que par celui qui le tient en main** — l'autre parent, les grands-parents n'y ont jamais accès au quotidien.
2. **Se perd / s'abîme / s'arrête** — aucune continuité entre la période nounou, la MAM, l'école.
3. **N'est pas exploitable** — impossible de chercher « quand a-t-elle commencé la diversification ? » ou de suivre une tendance de sommeil.
4. Les apps existantes exigent que **le professionnel change d'outil** — irréaliste : la nounou aime son carnet papier.

### 2.2 Personas
| Persona | Besoin | Rôle |
|---|---|---|
| **Parent « pivot »** (toi) | Numériser sans friction, centraliser, contrôler l'accès | Admin, photographie le carnet |
| **Co-parent** | Voir la journée le soir, sans app à apprendre | Lecteur/contributeur |
| **Grands-parents / proches** | Suivre l'enfant à distance, en confiance | Lecteurs (accès premium) |
| **La nounou / MAM** | Ne rien changer à ses habitudes | *Aucun compte requis* — c'est le différenciateur |

### 2.3 Proposition de valeur
> **« Votre carnet de liaison, dématérialisé sans rien demander à la nounou. »**
- 📸 Une photo du carnet → entrée de journal structurée (date, repas, sieste, humeur, activités, citation intégrale).
- 🧠 Le LLM comprend le manuscrit, corrige, tague, rend cherchable.
- 🔒 Données chez vous (homelab), pas chez un GAFAM ni une startup qui fermera.
- 👨‍👩‍👧 Partage granulaire : chaque proche voit ce que vous décidez.
- 📚 Un journal continu de 0 à 10 ans, exportable (PDF, livre imprimé).

### 2.4 Paysage concurrentiel (recherche du 2026-07-10)
| Segment | Acteurs | Ce qu'ils ne font pas |
|---|---|---|
| B2B crèche/nounou | [Meeko](https://www.meeko.pro/), [Kidizz](https://kidizz.com/en/), LiveKid, [BoO](https://www.boo-solution.com/) | Exigent l'adoption par le pro ; données dans leur cloud |
| B2C journal bébé | [Tinybeans](https://tinybeans.com/), Qeepsake, Bebememo, FamilyAlbum | Pas d'ingestion manuscrite ; cloud propriétaire ; modèle pub/abonnement |
| Self-hosted | [Home Journal](https://github.com/cidrblock/home_journal), JournalOS | Généralistes, pas de pipeline photo→LLM, pas pensés « enfant » |
| OCR manuscrit | Transkribus, NotesOCR, VLMs locaux | Briques techniques, pas un produit famille |

**Le trou dans l'offre** : personne ne fait *ingestion côté parent (photo du carnet papier) + structuration LLM + hébergement souverain + partage familial contrôlé*. C'est notre intersection.

### 2.5 Hypothèses à valider (par ordre de risque)
| # | Hypothèse | Test | Critère de succès |
|---|---|---|---|
| H1 ✅ | **VALIDÉE (2026-07-10)** — le VLM lit de façon fiable l'écriture réelle de la nounou | Prototypé sur pages réelles du carnet | Fonctionne très bien |
| H2 | Le geste « photo chaque soir » tient dans la durée | Dogfooding 4 semaines en famille | ≥ 5 photos/semaine sans lassitude |
| H3 | Les proches consultent réellement | Inviter 3-5 proches, mesurer les visites | ≥ 2 visites/semaine/proche le 1er mois |
| H4 | D'autres parents paieraient | 10 interviews (parents avec nounou/MAM) + landing page fictive | ≥ 30 % « je paierais 3-5 €/mois » |

⚠️ **Ne pas construire au-delà du MVP tant que H2 n'est pas validée.** H1 validée le 2026-07-10 : l'extraction VLM sur le carnet réel fonctionne très bien → go pour la Phase 1.

### 2.6 Monétisation
Cohérent avec ton modèle homelab existant :
1. **Phase 1 — Cercle premium** : accès proches payant (comme tes autres services), ex. 2-3 €/mois par foyer invité ou inclus dans ton bundle premium existant. Coût marginal ≈ appels API VLM (quelques centimes/page) ou nul si VLM local.
2. **Phase 2 (optionnelle) — SaaS de niche** : si H4 validée, offre hébergée pour parents non-techniques : 4-5 €/mois. Positionnement « privacy-first, made in France, vos données ne nourrissent personne ». Stripe déjà dans ton outillage.
3. **Upsell physique** : export livre imprimé annuel (marge sur impression à la demande) — c'est le modèle qui fait vivre Qeepsake.

### 2.7 Risques
- **RGPD / données d'enfants** : catégorie sensible. En cercle privé familial = exemption domestique. En SaaS = DPA, consentement, hébergement UE obligatoires. → Rester en phase 1 tant que non traité.
- **Droit du carnet** : le contenu écrit par la nounou lui appartient moralement ; en usage privé aucun souci, en SaaS prévoir CGU claires.
- **Concurrence gratuite** : Tinybeans & co sont gratuits — ne jamais se battre sur « album photo », toujours sur « carnet manuscrit + souveraineté ».
- **Fiabilité VLM sur écritures difficiles** : prévoir un écran de relecture/correction avant publication (humain dans la boucle).

### 2.8 Métriques PMF
- Rétention du geste photo (W4, W12)
- Taux de correction manuelle des extractions (proxy qualité VLM, cible < 10 %)
- Visites hebdo des proches invités
- (Phase 2) conversion landing → liste d'attente → payant

---

## 3. Plan d'implémentation

### 3.1 Architecture cible (homelab)
```
[Téléphone parent] --photo--> [PWA Racontine]
                                    |
                              [API backend]
                                    |
                +-------------------+-------------------+
                |                   |                   |
        [File d'ingestion]   [PostgreSQL]        [Stockage objets]
                |             (journal,           (photos originales,
        [Worker VLM]           entrées,            miniatures)
         Claude API ou         utilisateurs,
         Qwen-VL local         permissions)
                |
        [Entrée structurée] --> relecture parent --> publication --> notification proches
```
- **Conteneurisé Docker Compose**, derrière ton reverse proxy existant (Traefik/NPM) + SSO si tu en as un (Authelia/Authentik).
- **PWA mobile-first** plutôt qu'app native : la photo se prend depuis le navigateur, pas de stores, installable sur l'écran d'accueil des grands-parents.

### 3.2 Stack proposée
| Couche | Choix | Pourquoi |
|---|---|---|
| Front | **Vite + React + TypeScript + shadcn/ui + Tailwind** (PWA, pas de SSR) | Rendu premium out of the box (produit émotionnel montré aux proches), composants possédés dans le repo (cohérent souveraineté), meilleure vélocité en dev assisté par LLM |
| Back | **Node/TypeScript (Fastify)** | Simple, homogène avec le front, bon écosystème LLM |
| Auth | **Better Auth** (invitations, magic links pour les proches) | Skill déjà disponible ; magic link = zéro friction grands-parents |
| BDD | **PostgreSQL** | Requêtes riches (timeline, recherche plein texte) |
| Fichiers | Volume local ou MinIO | Homelab |
| VLM | **API Claude (vision)** au départ → option **Qwen3-VL local** ensuite | Valider H1 vite avec la meilleure qualité, internaliser après |
| Paiement | **Stripe** (déjà outillé) | Cohérent avec tes autres services |

### 3.3 Pipeline d'ingestion (le cœur du produit)
1. **Capture** : photo(s) de la/des pages du jour (multi-pages supporté).
2. **Pré-traitement** : redressement/recadrage (OpenCV ou lib JS), compression.
3. **Extraction VLM** — un seul appel vision avec sortie structurée :
   ```json
   {
     "date": "2026-07-10",
     "enfant": "…",
     "repas": [{"moment": "midi", "contenu": "purée courgette", "appetit": "tout mangé"}],
     "siestes": [{"debut": "13h", "fin": "15h10"}],
     "humeur": "joyeuse, un peu fatiguée au réveil",
     "activites": ["parc", "peinture"],
     "sante": null,
     "anecdotes": ["a dit 'papillon' pour la première fois"],
     "transcription_integrale": "…",
     "incertitudes": ["mot illisible ligne 4"]
   }
   ```
4. **Relecture** : diff visuel photo ↔ extraction, correction inline, champs incertains surlignés (humain dans la boucle — non négociable).
5. **Publication** : entrée du journal + photo originale archivée + notification aux proches autorisés.

### 3.4 Modèle de données (simplifié)
- `children` (1 foyer → n enfants)
- `entries` (1 jour × 1 enfant × 1 source : nounou / MAM / maison)
- `entry_items` (repas, sieste, humeur… typés pour les graphiques)
- `attachments` (photos du carnet + photos souvenirs)
- `users` + `memberships` (rôles : admin / contributeur / lecteur ; portée par enfant)
- `milestones` (premiers mots, premiers pas — extraits automatiquement des anecdotes par le LLM 🎯)

### 3.5 Phasage
**Phase 0 — Spike de validation** ✅ **TERMINÉE (2026-07-10)**
- [x] Extraction testée sur pages réelles du carnet → fonctionne très bien (H1 validée)

**Phase 1 — MVP familial (2-4 semaines de soirées)** ← en cours
- [ ] Docker Compose : back + Postgres + front PWA
- [ ] Upload photo → pipeline → écran de relecture → timeline
- [ ] Auth Better Auth : toi + co-parent
- [ ] Dogfooding 4 semaines (H2)

**Phase 2 — Cercle des proches (2-3 semaines)**
- [ ] Invitations magic-link, rôles lecteurs, permissions par enfant
- [ ] Notifications (mail ou ntfy que tu as déjà)
- [ ] Recherche plein texte + filtres (repas, sommeil…)
- [ ] Mesurer H3

**Phase 3 — Premium & confort**
- [ ] Intégration à ton système premium existant (Stripe)
- [ ] Graphiques tendances (sommeil, appétit), détection de jalons
- [ ] Export PDF / livre annuel
- [ ] Option VLM local (Qwen3-VL) pour couper la dépendance API

**Phase 4 (si H4 validée) — SaaS**
- Landing page, liste d'attente, multi-tenant, RGPD complet, hébergement UE.

### 3.6 Sécurité (exigence « accrue »)
- Tout derrière reverse proxy + TLS ; idéalement SSO/2FA pour les admins, magic link + device cookie pour les lecteurs.
- Photos et BDD chiffrées au repos (LUKS côté homelab suffit en phase 1).
- Aucune donnée envoyée au VLM cloud sans le savoir : consigner dans l'UI « cette page sera analysée via API Claude » ; passage en local en phase 3 pour une confidentialité totale.
- Sauvegardes chiffrées hors site (les souvenirs d'enfance sont irremplaçables — c'est un argument produit autant que technique).
- Logs d'accès visibles par l'admin (« qui a vu quoi »).

### 3.7 Estimation d'effort global
| Phase | Effort |
|---|---|
| 0 — Spike | ✅ fait |
| 1 — MVP | ~30-40 h |
| 2 — Proches | ~20 h |
| 3 — Premium | ~20-30 h |

---

## Prochaine action
👉 **Phase 1 — MVP familial** : Docker Compose (back + Postgres + PWA), pipeline upload → extraction → relecture → timeline, auth Better Auth. Objectif : dogfooding en famille pour valider H2 (le geste photo tient dans la durée).
