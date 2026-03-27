import axios from 'axios'

const log = (msg: string) => console.log(`[podcast] ${msg}`)

interface ItunesResult {
  collectionName: string
  feedUrl: string
  artistName: string
}

/**
 * Search the iTunes/Apple Podcast directory for a podcast by title.
 * Returns the RSS feed URL if found, null otherwise.
 */
export async function findPodcastFeedUrl(title: string): Promise<string | null> {
  try {
    const { data } = await axios.get<{ results: ItunesResult[] }>(
      'https://itunes.apple.com/search',
      {
        params: { term: title, entity: 'podcast', limit: 5 },
        timeout: 10000,
      },
    )

    if (!data.results || data.results.length === 0) {
      log(`No iTunes results for "${title}"`)
      return null
    }

    // Try exact title match first (case-insensitive)
    const exact = data.results.find(
      r => r.collectionName.toLowerCase() === title.toLowerCase(),
    )
    if (exact?.feedUrl) {
      log(`Found exact match: "${exact.collectionName}" by ${exact.artistName}`)
      return exact.feedUrl
    }

    // Fall back to first result with a feed URL
    const first = data.results.find(r => r.feedUrl)
    if (first?.feedUrl) {
      log(`Found closest match: "${first.collectionName}" by ${first.artistName}`)
      return first.feedUrl
    }

    log(`No feed URL in iTunes results for "${title}"`)
    return null
  } catch (err) {
    log(`iTunes search failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

/**
 * Fetch a podcast RSS feed and return the latest episode's audio URL.
 */
export async function getLatestEpisodeUrl(feedUrl: string): Promise<{ url: string; title: string } | null> {
  try {
    const { data } = await axios.get<string>(feedUrl, {
      timeout: 10000,
      responseType: 'text',
      headers: { 'User-Agent': 'HomeFairy/1.0' },
    })

    // Parse the first <item> enclosure URL
    const itemMatch = data.match(/<item>([\s\S]*?)<\/item>/)
    if (!itemMatch) {
      log('No episodes found in RSS feed')
      return null
    }

    const item = itemMatch[1]
    const enclosureMatch = item.match(/<enclosure[^>]*url="([^"]+)"/)
    if (!enclosureMatch) {
      log('No enclosure URL in latest episode')
      return null
    }

    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)
    const episodeTitle = titleMatch?.[1] ?? 'Unknown episode'

    // Decode XML entities in URL
    const url = enclosureMatch[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')

    log(`Latest episode: "${episodeTitle}" (${url.substring(0, 80)}...)`)
    return { url, title: episodeTitle }
  } catch (err) {
    log(`RSS fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
