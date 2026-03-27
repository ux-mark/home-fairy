import type { SonosFavourite } from '@/lib/api'

/** Known Sonos content sources derived from favourite URIs */
export function getAvailableSources(favourites: SonosFavourite[]): string[] {
  const sources = new Set<string>()
  for (const fav of favourites) {
    const uri = fav.uri
    if (!uri) continue
    if (uri.includes('spotify')) sources.add('Spotify')
    if (uri.includes('tunein') || (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=303'))) sources.add('TuneIn')
    if (uri.startsWith('x-sonosapi-stream:') && uri.includes('sid=333')) sources.add('Sonos Radio')
    if (uri.startsWith('x-sonos-htastream:')) sources.add('TV')
  }
  // Always include TV/line-in as a source since it's common
  sources.add('TV')
  return Array.from(sources).sort()
}
