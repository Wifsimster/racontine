import { test } from "node:test";
import assert from "node:assert/strict";
import { findMalformedProxies } from "./config.js";

// TRUSTED_PROXIES décide de qui a le droit de nous dire d'où vient le client.
// Une entrée mal écrite ne correspond à aucun relais : la limitation de débit
// repasse sur un seau partagé, sans qu'aucune erreur ne le signale. Ces cas
// sont donc ceux qu'on veut voir échouer au démarrage plutôt qu'en production.

test("accepte une IPv4 et un CIDR IPv4", () => {
  assert.deepEqual(
    findMalformedProxies(["172.18.0.60", "172.18.0.0/16", "10.0.0.0/8"]),
    [],
  );
});

test("accepte une IPv6 et un CIDR IPv6", () => {
  assert.deepEqual(findMalformedProxies(["::1", "fd00::/8", "2001:db8::1"]), []);
});

test("accepte la topologie livrée en exemple", () => {
  // Réseau du reverse proxy + réseau de la stack : les deux maillons dont les
  // limiteurs ont besoin (cf. les deux pièges documentés dans .env.example).
  assert.deepEqual(
    findMalformedProxies(["172.18.0.0/16", "192.168.32.0/20"]),
    [],
  );
});

test("rejette un préfixe hors bornes", () => {
  // /33 sur de l'IPv4 ne peut désigner aucune adresse.
  assert.deepEqual(findMalformedProxies(["172.18.0.0/33"]), ["172.18.0.0/33"]);
  assert.deepEqual(findMalformedProxies(["fd00::/129"]), ["fd00::/129"]);
});

test("accepte les préfixes aux bornes exactes", () => {
  assert.deepEqual(findMalformedProxies(["172.18.0.0/32", "fd00::/128"]), []);
});

test("rejette un nom d'hôte", () => {
  // Piège classique : mettre le nom du service Docker au lieu de son réseau.
  assert.deepEqual(findMalformedProxies(["traefik"]), ["traefik"]);
});

test("rejette un octet IPv4 hors bornes", () => {
  assert.deepEqual(findMalformedProxies(["172.18.0.999"]), ["172.18.0.999"]);
});

test("rejette une plage écrite avec un tiret", () => {
  assert.deepEqual(findMalformedProxies(["172.18.0.0-172.18.255.255"]), [
    "172.18.0.0-172.18.255.255",
  ]);
});

test("rejette un préfixe non numérique", () => {
  assert.deepEqual(findMalformedProxies(["172.18.0.0/seize"]), [
    "172.18.0.0/seize",
  ]);
});

test("ne signale que les entrées fautives d'une liste mixte", () => {
  // Une seule coquille au milieu d'une liste correcte doit rester visible.
  assert.deepEqual(
    findMalformedProxies(["172.18.0.0/16", "traefik", "10.0.0.1"]),
    ["traefik"],
  );
});

test("une liste vide n'est pas une erreur", () => {
  assert.deepEqual(findMalformedProxies([]), []);
});
