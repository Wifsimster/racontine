/**
 * Les deux URL par lesquelles le front demande une page de carnet.
 *
 * La route qui sert les fichiers les déclare `immutable` pour un an : c'est
 * juste, un import n'est jamais réécrit — sauf par une rotation, qui remplace le
 * JPEG à URL constante. Le numéro de révision (`?v=`, le cumul des quarts de
 * tour) rend l'URL différente après chaque rotation, sinon le navigateur
 * continuerait d'afficher la page de travers sur la foi de son cache.
 */
export function attachmentUrls(a: { id: string; rotation: number }): {
  url: string;
  thumbUrl: string;
} {
  const v = a.rotation ? `&v=${a.rotation}` : "";
  return {
    // `size` d'abord dans les deux cas : une seule forme d'URL à lire.
    url: `/api/attachments/${a.id}?size=full${v}`,
    thumbUrl: `/api/attachments/${a.id}?size=thumb${v}`,
  };
}
