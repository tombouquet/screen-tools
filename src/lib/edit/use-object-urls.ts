import { useEffect, useState } from 'react';

/**
 * Object URLs for some blobs, freed when the blobs change or the component goes away.
 * They're made in the effect, not during render, so the cleanup and the next run stay
 * paired (StrictMode runs effects twice in development). Pass a memoised map.
 */
export function useObjectUrls<K>(blobs: Map<K, Blob>): Map<K, string> {
  const [urls, setUrls] = useState(() => new Map<K, string>());
  useEffect(() => {
    const next = new Map([...blobs].map(([key, blob]) => [key, URL.createObjectURL(blob)] as const));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [blobs]);
  return urls;
}
