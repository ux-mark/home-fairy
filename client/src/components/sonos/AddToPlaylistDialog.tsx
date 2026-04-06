/**
 * AddToPlaylistDialog — generic wrapper that dispatches to the appropriate
 * playlist dialog based on the `type` prop.
 *
 * Usage:
 *   <AddToPlaylistDialog
 *     type="fairylist"
 *     open={open}
 *     onOpenChange={setOpen}
 *     track={{ source, source_uri, title, artist, album_art_uri }}
 *   />
 *
 *   <AddToPlaylistDialog
 *     type="spotify"
 *     open={open}
 *     onOpenChange={setOpen}
 *     trackUri={uri}
 *     trackName={name}
 *   />
 */

import { AddToFairylistDialog } from './AddToFairylistDialog'
import { AddToSpotifyPlaylistDialog } from './AddToSpotifyPlaylistDialog'

// ── Base props ────────────────────────────────────────────────────────────────

interface BaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ── Fairylist variant ─────────────────────────────────────────────────────────

interface FairylistProps extends BaseProps {
  type: 'fairylist'
  track: {
    source: 'sonos' | 'spotify' | 'nas' | 'radio'
    source_uri: string
    title: string
    artist?: string
    album_art_uri?: string
  }
  trackUri?: never
  trackName?: never
}

// ── Spotify playlist variant ──────────────────────────────────────────────────

interface SpotifyPlaylistProps extends BaseProps {
  type: 'spotify'
  trackUri: string
  trackName: string
  track?: never
}

type AddToPlaylistDialogProps = FairylistProps | SpotifyPlaylistProps

// ── Component ─────────────────────────────────────────────────────────────────

export function AddToPlaylistDialog(props: AddToPlaylistDialogProps) {
  if (props.type === 'fairylist') {
    return (
      <AddToFairylistDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        track={props.track}
      />
    )
  }

  return (
    <AddToSpotifyPlaylistDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      trackUri={props.trackUri}
      trackName={props.trackName}
    />
  )
}
