import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "./config.js";

/**
 * Chiffrement symétrique des secrets applicatifs (clés API des utilisateurs).
 *
 * La clé de chiffrement est dérivée du secret d'auth de l'instance
 * (`BETTER_AUTH_SECRET`) par SHA-256 → 32 octets, adaptés à AES-256-GCM. Aucune
 * variable d'environnement supplémentaire n'est donc requise. Conséquence : si
 * l'opérateur change `BETTER_AUTH_SECRET`, les blobs déjà chiffrés deviennent
 * illisibles — l'utilisateur devra ressaisir sa clé (traité proprement en
 * amont, jamais une erreur 500).
 */
const KEY = createHash("sha256").update(config.auth.secret).digest();
const IV_LEN = 12; // nonce standard pour GCM
const TAG_LEN = 16;
const VERSION = "v1";

/** Chiffre une valeur en clair → « v1:<base64(iv | tag | ciphertext)> ». */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/**
 * Déchiffre un blob produit par `encryptSecret`. Lève si le format est invalide,
 * si le secret d'instance a changé, ou si le blob a été altéré (échec GCM).
 */
export function decryptSecret(blob: string): string {
  const sep = blob.indexOf(":");
  const version = sep === -1 ? "" : blob.slice(0, sep);
  const payload = sep === -1 ? "" : blob.slice(sep + 1);
  if (version !== VERSION || !payload)
    throw new Error("blob chiffré invalide");
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
    "utf8",
  );
}
