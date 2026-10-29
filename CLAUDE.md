# CLAUDE.md

## Commentaires

Décision du 2026-10-29 : **aucun commentaire dans le code** (tous langages, y compris YAML, Dockerfile, shell, CSS, HTML, `.env.example`). Ils vieillissent et égarent les agents ; le pourquoi va dans le message de commit et la PR.

Seules exceptions, les directives d'outils qui changent un comportement et les en-têtes de licence :

- `eslint-disable*`, `oxlint-disable*`, `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `/// <reference …>`
- shebang (`#!/usr/bin/env …`), `# syntax=` (Dockerfile), `# shellcheck …`, `# noqa`
- commentaires magiques de bundler (`webpackChunkName`, `@vite-ignore`, …)
- en-têtes de licence

Fichiers générés (lockfiles, `*.gen.ts`, migrations et leur `meta/`, fichiers marqués générés) et Markdown : laissés tels quels.
