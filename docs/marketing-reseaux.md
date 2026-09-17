# Racontine sur les réseaux

> Les messages prêts à publier — Facebook et X — et les trois règles qui les
> tiennent.

Ce document sert à publier sans réécrire à chaque fois : un post principal par
réseau, des variantes selon l'audience, une version publicité, et ce qu'on ne
dit jamais. Les règles, la FAQ et les interdits sont communs ; seules les
formes changent, parce qu'un post de 280 signes n'est pas un post de 900.
Le produit, le prix et la promesse viennent de [tarif.md](./tarif.md) et du
[plan produit](../PLAN-PRODUIT.md) — si l'un change, ce fichier est à corriger.

Le lien public est **https://racontine.battistella.ovh/** — l'instance hébergée
par le studio, celle qui montre l'offre et ouvre l'essai. C'est le seul lien à
coller dans un post ou une publicité.

---

## 1. Les trois règles

1. **On parle à un parent fatigué, à 21 h, le carnet posé sur la table.** Pas à
   un acheteur de logiciel. Le premier mot du post doit être une scène qu'il
   reconnaît, jamais une fonctionnalité.
2. **La nounou n'a rien à installer.** C'est le seul argument que les
   concurrents ne peuvent pas copier — il est dans les trois premières lignes,
   toujours.
3. **On ne promet que ce que le produit fait.** Pas de chiffres inventés, pas de
   témoignage fabriqué, pas de « des milliers de familles ». Racontine est jeune
   et le dit : c'est plus crédible qu'un faux succès.

---

## 2. Facebook — le post principal (lancement)

> 📖 Le carnet de la nounou, il n'y en a qu'un. Et il est toujours dans l'autre sac.
>
> Repas, sieste, humeur, la bêtise du jour : tout est écrit là, à la main, sur un
> carnet que l'autre parent ne voit jamais et que les grands-parents n'ouvriront
> pas une seule fois.
>
> Racontine règle ça sans rien demander à la nounou : **vous photographiez la page,
> l'application la lit.** Elle en fait une journée classée — repas, siestes,
> activités, anecdotes — dans un journal privé, cherchable, partagé avec les
> proches que vous choisissez.
>
> 🤳 Une photo le soir, c'est tout.
> 👵 Mamie reçoit un e-mail et clique : pas de compte à créer, pas d'app à apprendre.
> 🔒 Vos données restent les vôtres — hébergées en France, ou chez vous si vous le
> souhaitez. Ni publicité, ni revente, ni revendeur.
> 📚 Trois ans plus tard, vous cherchez « première dent » et vous tombez dessus.
>
> 14 jours d'essai, sans carte bancaire. Ensuite 4,99 €/mois pour tout le foyer —
> les proches ne paient jamais rien.
>
> 👉 https://racontine.battistella.ovh/

**Visuel :** la page manuscrite d'un carnet à gauche, la journée structurée de
l'app à droite. C'est la démonstration entière en une image ; aucun texte
promotionnel par-dessus (Meta pénalise, et surtout ça abîme la démonstration).

**L'aperçu du lien** est déjà dessiné : Facebook lit `public/og.png`, la carte
de lien regénérée par `pnpm brand` (voir [identite.md](./identite.md) §3). Quand
le post porte son propre visuel — c'est le cas ici — le lien descend **dans le
premier commentaire**, avec la FAQ ci-dessous : deux images candidates dans un
même post, et Meta choisit laquelle montrer, rarement la bonne. La dernière
ligne du post devient alors « Le lien est en commentaire 👇 ».

**Premier commentaire, à épingler :**

> 👉 https://racontine.battistella.ovh/
>
> Et les deux questions qu'on nous pose toujours 👇
> • *Faut-il que la nounou s'inscrive ?* Non. Elle garde son carnet papier, elle
> ne saura même pas que Racontine existe.
> • *Et si j'arrête de payer ?* Le journal déjà écrit reste lisible et partagé.
> On ne prend pas les souvenirs en otage : l'abonnement paie l'ajout d'une
> journée, jamais sa lecture.

---

## 3. Facebook — les variantes

### a. Version courte (story, partage dans un groupe de parents)

> Le carnet de liaison de la nounou, photographié le soir → une journée de journal
> classée (repas, siestes, humeur, anecdotes), partagée avec le co-parent et les
> grands-parents. La nounou, elle, ne change rien à ses habitudes.
> 14 jours d'essai sans carte. 👉 https://racontine.battistella.ovh/

### b. Version « les grands-parents » (audience 55+, ciblage large)

> Elle a 14 mois, elle est gardée à 400 km, et vous apprenez ses journées le
> dimanche au téléphone.
>
> Racontine envoie aux proches un e-mail le soir : la journée de l'enfant, telle
> que la nounou l'a écrite dans son carnet. Deux repas, une sieste de 2 h, joyeuse,
> et la phrase qu'elle a dite en sortant.
>
> Rien à installer, rien à créer : ce sont les parents qui invitent, et le lien
> s'ouvre d'un clic.
>
> 👉 https://racontine.battistella.ovh/

### c. Version « données personnelles » (groupes self-hosting, tech, r/France-style)

> Un journal d'enfance qui ne finit pas dans le cloud de quelqu'un d'autre.
>
> Racontine transforme la photo d'un carnet de liaison papier en journal
> structuré et cherchable. Le code est là, l'instance peut tourner **chez vous**
> (Docker + Postgres), et la version hébergée est en France, chez un studio
> indépendant — pas de publicité, pas de revente, pas de rachat prévu.
>
> Les proches n'ont pas de mot de passe : ils reçoivent un lien magique et lisent
> ce que vous avez décidé de partager, carnet par carnet.
>
> 👉 https://racontine.battistella.ovh/

### d. Version « recherche » (rappel, 3-4 semaines après le lancement)

> « À quel âge a-t-elle commencé la diversification ? »
>
> Sur un carnet papier, la réponse est dans un carton au grenier. Dans Racontine,
> c'est une recherche : les journées sont taguées à la lecture (repas, siestes,
> activités, anecdotes, santé), mois par mois, année après année.
>
> Le carnet de la nounou, mais consultable dix ans plus tard. 👉 https://racontine.battistella.ovh/

---

## 4. Facebook — la publicité (Meta Ads)

| Champ | Texte |
|---|---|
| **Texte principal** | Le carnet de la nounou ne quitte jamais son sac — et l'autre parent ne le lit jamais. Photographiez la page : Racontine en fait une journée de journal classée (repas, siestes, humeur, anecdotes), partagée avec les proches que vous choisissez. La nounou, elle, ne change rien. 14 jours d'essai, sans carte. |
| **Titre** | Le carnet de la nounou, enfin lisible par toute la famille |
| **Description** | 4,99 €/mois pour le foyer. Les proches ne paient jamais. |
| **Bouton** | En savoir plus *(pas « S'inscrire » : l'inscription vient après l'essai, promettre l'inverse fait chuter la conversion)* |

**Ciblage** : parents d'enfants de 0 à 3 ans, France, intérêts « assistante
maternelle », « crèche », « MAM », « congé parental ». Exclure les audiences
professionnelles de la petite enfance : le produit ne leur demande rien, il ne
leur vend rien.

**Titres à tester en A/B** (un seul change à la fois) :
- « Photographiez le carnet. Le reste est écrit. »
- « Mamie sait ce qu'elle a mangé à midi. »
- « Un journal d'enfance qui n'appartient qu'à vous. »

---

## 5. X — le fil de lancement

Cinq posts, publiés d'un coup. Chacun tient sous 280 signes (une URL en compte
23, quelle qu'en soit la longueur ; une image n'en coûte aucun). Le lien n'arrive
qu'au dernier : sur X, un lien posé en tête fait chuter la portée du fil entier,
et surtout personne ne clique avant d'avoir compris.

**1/**

> Le carnet de liaison de la nounou, il n'y en a qu'un — et il est toujours dans l'autre sac.
>
> L'autre parent ne le lit jamais. Les grands-parents, pas une fois.
>
> On a construit Racontine pour ça. 🧵

**2/**

> Le principe tient en un geste : vous photographiez la page du carnet.
>
> Un modèle de vision lit le manuscrit et en fait une journée structurée — repas, siestes, humeur, activités, anecdotes — taguée et cherchable.
>
> Rien n'est publié sans vous : chaque journée arrive en brouillon.

**3/**

> Le vrai choix de conception : la nounou n'installe rien, ne crée aucun compte, ne sait même pas que Racontine existe.
>
> Toutes les apps du secteur demandent au pro de changer d'outil. Il aime son carnet papier. Alors on part du papier.

**4/**

> Les proches n'ont pas de mot de passe : ils reçoivent le soir un e-mail avec la journée, et un lien qui s'ouvre d'un clic.
>
> Les données sont en France, chez un studio indépendant — ou chez vous : le code est ouvert, l'instance s'auto-héberge (Docker + Postgres).

**5/**

> Ce qui est payant, c'est AJOUTER une journée. Pas la lire.
>
> Un abonnement qui s'arrête met le carnet en pause ; il ne le referme pas. On ne prend pas les souvenirs en otage.
>
> 4,99 €/mois pour le foyer, les proches ne paient rien. 14 j d'essai sans carte.
>
> https://racontine.battistella.ovh/

**Le visuel va sur le post 2**, pas sur le 1 : c'est celui qui décrit le geste,
et l'image (page manuscrite à gauche, journée structurée à droite) le prouve au
lieu de l'illustrer. Même image que sur Facebook, même règle — aucun texte
promotionnel par-dessus.

---

## 6. X — les posts isolés

À publier hors fil, une à deux fois par semaine. Chacun se suffit : sur X, un
post est lu sans ce qui l'entoure.

**a. Sans lien** (meilleure portée ; le lien va en réponse)

> Le carnet de liaison de la nounou, il n'y en a qu'un — et il est toujours dans l'autre sac.
>
> Vous photographiez la page, Racontine la lit : une journée classée (repas, siestes, humeur, anecdotes), dans un journal privé partagé avec vos proches.
>
> La nounou, elle, ne change rien.

**b. Avec lien** (quand le post part seul, sans suivi)

> Le carnet de la nounou, il n'y en a qu'un — et il est toujours dans l'autre sac.
>
> Photographiez la page : Racontine la lit et en fait une journée classée, dans un journal privé partagé avec vos proches. La nounou ne change rien.
>
> 14 j d'essai, sans carte 👉 https://racontine.battistella.ovh/

**c. La recherche** (rappel, une fois le carnet garni)

> « À quel âge a-t-elle commencé la diversification ? »
>
> Sur un carnet papier, la réponse est dans un carton au grenier.
>
> Dans Racontine, c'est une recherche : les journées sont taguées à la lecture, mois par mois, année après année.
>
> https://racontine.battistella.ovh/

**d. Pour la timeline tech / self-hosting**

> Un journal d'enfance qui ne finit pas dans le cloud de quelqu'un d'autre.
>
> Photo d'un carnet de liaison papier → VLM → journal structuré, cherchable, partagé par liens magiques.
>
> Self-hostable : Docker + Postgres + votre clé API.
>
> https://racontine.battistella.ovh/

Deux réflexes propres à X : **un seul hashtag maximum** (aucun, le plus souvent
— ils ne portent plus rien et signalent la publicité), et **la carte de lien
qu'affiche X est `public/og.png`**, la même que Facebook. Ne pas joindre en plus
une image au post qui porte le lien : la carte disparaîtrait.

## 7. Réponses aux commentaires fréquents

| Ce qu'on lit | Ce qu'on répond |
|---|---|
| « La nounou doit s'inscrire ? » | Non, jamais. Elle garde son carnet papier ; c'est vous qui photographiez. |
| « C'est une IA qui lit ? Elle se trompe ? » | Oui, un modèle de vision lit le manuscrit, et rien n'est publié sans vous : chaque journée arrive en brouillon, vous relisez et corrigez avant qu'un proche la voie. |
| « Mes photos servent à entraîner un modèle ? » | Non. Elles servent à lire la page, point. Vos journées ne sont ni revendues ni utilisées pour entraîner quoi que ce soit. |
| « 4,99 €, c'est par personne ? » | Non, c'est pour le foyer. Le co-parent contribue, les grands-parents lisent : on ne leur demande pas de carte. |
| « Et si le service ferme ? » | Le code est ouvert et l'application s'auto-héberge : une instance chez vous continue de tourner. Et l'export existe. |
| « Ça marche pour la crèche / la MAM ? » | Oui — tout ce qui s'écrit sur papier se photographie de la même façon. |

---

## 8. Ce qu'on ne publie jamais

- **Aucune photo d'un enfant réel**, ni d'une page de carnet portant un vrai nom.
  Les captures de démonstration utilisent un carnet fictif — un produit qui vend
  la vie privée ne l'entame pas dans sa propre publicité.
- **Aucun chiffre d'usage** tant qu'il n'est pas mesuré (« X familles », « Y % de
  temps gagné »).
- **Aucun témoignage** qui n'a pas été écrit par la personne citée, avec son accord.
- **Aucune comparaison nominative** avec un concurrent : on décrit le trou dans
  l'offre, on ne désigne personne.
- **Aucune promesse médicale** (sommeil, croissance, alimentation). Racontine
  recopie ce que la nounou a écrit ; il ne conseille pas.

---

## 9. Rythme

**Sur Facebook**, trois publications suffisent pour un lancement : **le post
principal**, puis la variante *grands-parents* à J+5, puis la variante
*recherche* à J+21 — quand les premiers carnets ont assez de journées pour que
l'argument soit vrai. Publier entre 20 h 30 et 22 h : c'est l'heure où le carnet
est sur la table.

**Sur X**, le fil de lancement une fois, puis un post isolé une à deux fois par
semaine, en alternant les angles (le geste, les proches, la recherche, le
self-hosting). Le matin y vaut mieux que le soir — ce n'est pas la même audience
ni le même moment de lecture. Republier le même post à quinze jours d'écart n'a
rien d'une faute : sur X, presque personne n'a vu le premier.
