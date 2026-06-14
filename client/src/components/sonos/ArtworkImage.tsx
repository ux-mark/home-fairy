import { useState } from 'react'
import { Disc3, ImageOff, User } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap any image URL through the art-proxy for server-side disk caching + PWA offline */
// eslint-disable-next-line react-refresh/only-export-components
export function proxyArtUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  // Already proxied
  if (url.startsWith('/api/sonos/art-proxy')) return url
  // Relative path (should not happen, but be safe)
  if (url.startsWith('/')) return url
  return `/api/sonos/art-proxy?url=${encodeURIComponent(url)}`
}

// ── Fallback icons ──────────────────────────────────────────────────────────

type FallbackIcon = 'disc' | 'image' | 'user'

function FallbackContent({ icon, iconSize }: { icon: FallbackIcon; iconSize: number }) {
  const cls = `text-caption/40`
  const style = { width: iconSize, height: iconSize }
  switch (icon) {
    case 'disc':
      return <Disc3 className={cls} style={style} aria-hidden="true" />
    case 'user':
      return <User className={cls} style={style} aria-hidden="true" />
    case 'image':
    default:
      return <ImageOff className={cls} style={style} aria-hidden="true" />
  }
}

// ── ArtworkImage ─────────────────────────────────────────────────────────────

export interface ArtworkImageProps {
  /** Single URL string (NAS/radio art-proxy URLs, or any direct URL) */
  src?: string | null
  /** Spotify-style images array — first entry used */
  images?: Array<{ url: string; height?: number | null; width?: number | null }> | null
  /** Width/height in px */
  size?: number
  /** Tailwind border-radius class */
  rounded?: string
  /** Fallback icon when no image available */
  fallback?: FallbackIcon
  /** Whether to proxy the URL through art-proxy (default true) */
  proxy?: boolean
}

/**
 * Unified artwork image component.
 * Accepts either a `src` string or a Spotify `images` array.
 * All URLs are routed through the art-proxy by default for caching.
 */
export function ArtworkImage({
  src,
  images,
  size = 40,
  rounded = 'rounded-md',
  fallback = 'image',
  proxy = true,
}: ArtworkImageProps) {
  const [failed, setFailed] = useState(false)

  // Resolve the URL: prefer `src`, then first Spotify image
  const rawUrl = src ?? images?.[0]?.url ?? undefined
  const url = proxy ? proxyArtUrl(rawUrl) : rawUrl

  const iconSize = Math.max(16, Math.round(size * 0.35))

  return (
    <div
      className={cn('shrink-0 overflow-hidden bg-[var(--bg-tertiary)]', rounded)}
      style={{ width: size, height: size }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          // Async decoding lets long lists of artwork rows scroll smoothly on
          // iOS Safari instead of blocking the main thread when many <img>
          // elements come into view at once.
          decoding="async"
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <FallbackContent icon={fallback} iconSize={iconSize} />
        </div>
      )}
    </div>
  )
}
