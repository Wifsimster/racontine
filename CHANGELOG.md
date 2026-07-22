# Changelog

Toutes les versions notables de Racontine. Format issu des messages de commit conventionnels (`feat`, `fix`, …).

## [1.10.1](https://github.com/Wifsimster/racontine/compare/v1.10.0...v1.10.1) (2026-07-22)


### Bug Fixes

* **web:** align UI with the design-system tokens ([#35](https://github.com/Wifsimster/racontine/issues/35)) ([f8b3366](https://github.com/Wifsimster/racontine/commit/f8b3366b6fc5559a3bba7fa8d0092130393d06af))

# [1.10.0](https://github.com/Wifsimster/racontine/compare/v1.9.2...v1.10.0) (2026-07-19)


### Features

* **web:** allow removing a captured page from an entry ([#33](https://github.com/Wifsimster/racontine/issues/33)) ([32678c1](https://github.com/Wifsimster/racontine/commit/32678c116344b9f91509780605d2ebcca0497c59))

## [1.9.2](https://github.com/Wifsimster/racontine/compare/v1.9.1...v1.9.2) (2026-07-19)


### Bug Fixes

* **ci:** drop unused pnpm cache from release job ([#32](https://github.com/Wifsimster/racontine/issues/32)) ([f330c96](https://github.com/Wifsimster/racontine/commit/f330c961f84bb703d77e6551ee57d09f2f9aff73))

## [1.9.1](https://github.com/Wifsimster/racontine/compare/v1.9.0...v1.9.1) (2026-07-19)


### Bug Fixes

* **web:** type VAPID key helper as Uint8Array<ArrayBuffer> ([#31](https://github.com/Wifsimster/racontine/issues/31)) ([56f2c6d](https://github.com/Wifsimster/racontine/commit/56f2c6d48c2053efa0c82c406b473acca13f59d6))

# [1.9.0](https://github.com/Wifsimster/racontine/compare/v1.8.0...v1.9.0) (2026-07-19)


### Features

* **notifications:** add browser Web Push (VAPID) ([#30](https://github.com/Wifsimster/racontine/issues/30)) ([9de2d31](https://github.com/Wifsimster/racontine/commit/9de2d31b9a3155491ebee17ae0092cc96260c896))

# [1.8.0](https://github.com/Wifsimster/racontine/compare/v1.7.0...v1.8.0) (2026-07-19)


### Features

* valider les incertitudes de lecture par des suggestions et un glossaire par enfant ([#27](https://github.com/Wifsimster/racontine/issues/27)) ([18b5692](https://github.com/Wifsimster/racontine/commit/18b5692347238158621ed649fbd41d40aab74638))

# [1.7.0](https://github.com/Wifsimster/racontine/compare/v1.6.0...v1.7.0) (2026-07-13)


### Features

* **web:** ajouter des images depuis l'album ([#24](https://github.com/Wifsimster/racontine/issues/24)) ([47b6101](https://github.com/Wifsimster/racontine/commit/47b6101b07d8f73403b438d441d4de8c3a8be5d0))

# [1.6.0](https://github.com/Wifsimster/racontine/compare/v1.5.0...v1.6.0) (2026-07-13)


### Features

* **mcp:** outil create_daily_note pour une journée déjà transcrite ([#23](https://github.com/Wifsimster/racontine/issues/23)) ([c5bc6bb](https://github.com/Wifsimster/racontine/commit/c5bc6bbae8b95f460e621c54ec10818c2f0f4c71))

# [1.5.0](https://github.com/Wifsimster/racontine/compare/v1.4.0...v1.5.0) (2026-07-12)


### Features

* **mcp:** pré-téléversement d'octets bruts pour les grosses pages ([#22](https://github.com/Wifsimster/racontine/issues/22)) ([de0c632](https://github.com/Wifsimster/racontine/commit/de0c63257fcaff11a9df9bc0a8ee4dc49aa1bdae))

# [1.4.0](https://github.com/Wifsimster/racontine/compare/v1.3.1...v1.4.0) (2026-07-12)


### Features

* **web:** page « Mon compte » pour les réglages par utilisateur ([4262b3d](https://github.com/Wifsimster/racontine/commit/4262b3d82a675a6ea9e93642751f4d5d01bbf1db))

## [1.3.1](https://github.com/Wifsimster/racontine/compare/v1.3.0...v1.3.1) (2026-07-12)


### Bug Fixes

* **server:** copier tsconfig.build.json dans l'image Docker ([1559291](https://github.com/Wifsimster/racontine/commit/1559291b1ccf2d34c83912c0558b90e64803c36b))

# [1.3.0](https://github.com/Wifsimster/racontine/compare/v1.2.0...v1.3.0) (2026-07-12)


### Features

* **llm:** clé API Anthropic par utilisateur (fin de la clé partagée d'instance) ([65ae67d](https://github.com/Wifsimster/racontine/commit/65ae67da7fdcf328f3def2c233d7192fc1f54180))

# [1.2.0](https://github.com/Wifsimster/racontine/compare/v1.1.0...v1.2.0) (2026-07-12)


### Features

* **mcp:** read tools, version wiring, and test suite ([#21](https://github.com/Wifsimster/racontine/issues/21)) ([52ec6da](https://github.com/Wifsimster/racontine/commit/52ec6da86dc9c5f5e924be9552ed2852e4ce26cb))

# [1.1.0](https://github.com/Wifsimster/racontine/compare/v1.0.1...v1.1.0) (2026-07-12)


### Features

* serveur MCP pour téléverser des photos de carnet depuis Claude ([#20](https://github.com/Wifsimster/racontine/issues/20)) ([874d799](https://github.com/Wifsimster/racontine/commit/874d7991672af10f34e223cece9ea9f21d757380))

## [1.0.1](https://github.com/Wifsimster/racontine/compare/v1.0.0...v1.0.1) (2026-07-11)


### Bug Fixes

* **web:** empêcher le panneau de notifications de déborder de l'écran ([#18](https://github.com/Wifsimster/racontine/issues/18)) ([fc227b5](https://github.com/Wifsimster/racontine/commit/fc227b553aa02046a033158b135286ca25a47d5a))

# 1.0.0 (2026-07-11)


### Bug Fixes

* **capture:** compresser les photos avant l'envoi pour éviter « Failed to fetch » ([#13](https://github.com/Wifsimster/racontine/issues/13)) ([dc6baf5](https://github.com/Wifsimster/racontine/commit/dc6baf557e51b20202f6f5b203bdbe5e448d333d))
* corrige 20 bugs de sécurité et de robustesse (revue par sous-agents) ([#8](https://github.com/Wifsimster/racontine/issues/8)) ([a0dbb11](https://github.com/Wifsimster/racontine/commit/a0dbb11374063afb365f3e116695ca5e626e0e3c))
* **vlm:** ne plus divulguer les erreurs brutes de l'API à l'utilisateur ([#15](https://github.com/Wifsimster/racontine/issues/15)) ([4a7c7cf](https://github.com/Wifsimster/racontine/commit/4a7c7cf77c97af01d75c1c40508d57ae3b08ca0e))


### Features

* écran de réglages pour le propriétaire de l'instance ([#12](https://github.com/Wifsimster/racontine/issues/12)) ([01581c0](https://github.com/Wifsimster/racontine/commit/01581c02a50d943a358c957f2def7d12531ca495))
* notify subscribers of a child's timeline on publish (in-app + email) ([#4](https://github.com/Wifsimster/racontine/issues/4)) ([d629d30](https://github.com/Wifsimster/racontine/commit/d629d30094d7be7ca5c2f9991041d1d4145f12ac))
* **partage:** cercle des proches — invitations, rôles et permissions par enfant ([#6](https://github.com/Wifsimster/racontine/issues/6)) ([1786b8d](https://github.com/Wifsimster/racontine/commit/1786b8db2a9181603889ceaf8821ba631717afdc))
* versionnement semantic-release et affichage de la version dans l'app ([#16](https://github.com/Wifsimster/racontine/issues/16)) ([cf8d889](https://github.com/Wifsimster/racontine/commit/cf8d889f1f2b6e10e3995547a2188117be8beb09))
* **web:** persist captured photos locally to survive upload failure or refresh ([#14](https://github.com/Wifsimster/racontine/issues/14)) ([6bc13ef](https://github.com/Wifsimster/racontine/commit/6bc13ef1a785f256d888a34cef6d10d8e30e46da))
* **web:** replace native confirm with shadcn AlertDialog ([98f22d9](https://github.com/Wifsimster/racontine/commit/98f22d902620e5736eab504d0df9487570d610fc))
