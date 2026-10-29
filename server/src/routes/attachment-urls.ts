export function attachmentUrls(a: { id: string; rotation: number }): {
  url: string;
  thumbUrl: string;
} {
  const v = a.rotation ? `&v=${a.rotation}` : "";
  return {
    url: `/api/attachments/${a.id}?size=full${v}`,
    thumbUrl: `/api/attachments/${a.id}?size=thumb${v}`,
  };
}
