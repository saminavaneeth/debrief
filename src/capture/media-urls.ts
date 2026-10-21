/**
 * One object URL per captured artifact. A capture's blob never changes after it is saved, so the
 * URL is created once and kept until the capture is deleted (live queries hand back a new Blob
 * object on every refresh, which would otherwise mint a new URL each time).
 */
const urls = new Map<string, string>();

export function mediaUrlFor(artifactId: string, blob: Blob): string {
  let url = urls.get(artifactId);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(artifactId, url);
  }
  return url;
}

export function releaseMediaUrl(artifactId: string) {
  const url = urls.get(artifactId);
  if (url) URL.revokeObjectURL(url);
  urls.delete(artifactId);
}

export function releaseAllMediaUrls() {
  for (const id of [...urls.keys()]) releaseMediaUrl(id);
}
