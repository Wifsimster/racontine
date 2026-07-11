/**
 * Réduit une photo de carnet avant l'envoi : les appareils photo de téléphone
 * produisent des JPEG de plusieurs Mo, et trois pages suffisent à dépasser la
 * limite de taille du reverse proxy — l'upload échoue alors avec un « Failed to
 * fetch » brut, sans réponse HTTP. Le serveur borne de toute façon les images à
 * 2400 px : redimensionner côté client rend l'envoi fiable et rapide en 4G.
 *
 * Best-effort : tout échec (format HEIC non décodable par le navigateur, canvas
 * indisponible…) renvoie le fichier d'origine, que le serveur sait normaliser.
 */
const MAX_DIM = 2000; // px, côté le plus long
const QUALITY = 0.82;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    // imageOrientation: "from-image" applique l'orientation EXIF au bitmap ; la
    // ré-encodage produit alors un JPEG déjà droit (sans métadonnée EXIF).
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    }).catch(() => createImageBitmap(file));

    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    // On ne garde le résultat que s'il allège réellement le fichier.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
