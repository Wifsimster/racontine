#!/usr/bin/env node
// Propage la version calculée par semantic-release dans tous les package.json
// du monorepo. Chaque contexte de build Docker (./web, ./server) est isolé et
// ne voit que son propre package.json, d'où la synchronisation des trois.
//
// Usage : node scripts/sync-version.mjs <version>

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("sync-version: version manquante en argument");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = ["package.json", "web/package.json", "server/package.json"];

for (const rel of targets) {
  const file = resolve(root, rel);
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.version = version;
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`sync-version: ${rel} → ${version}`);
}
