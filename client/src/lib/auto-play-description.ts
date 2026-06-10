import type { AutoPlayRule } from './api'

export function describeDays(days: number[] | null): string {
  if (days === null) return 'every day'
  if (days.length === 7) return 'every day'
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) return 'weekdays'
  if (days.length === 2 && days.includes(6) && days.includes(7)) return 'weekends'
  const shorts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return [...days].sort((a, b) => a - b).map(d => shorts[d - 1]).join(', ')
}

export interface DescribeRuleOptions {
  /**
   * Include the room name (or "whole house") in the action clause.
   * Settings → Music uses this because rules can span the whole house.
   * Per-room pages (RoomDetailPage, SonosDetailPage) omit it because
   * the page itself sets the room context.
   */
  includeRoom?: boolean
  /**
   * When the rule plays from the NAS library and the room context is
   * already implicit, label it "from library" instead of just the title.
   * SonosDetailPage has historically used this phrasing.
   */
  labelNasFromLibrary?: boolean
}

export function describeRule(
  rule: AutoPlayRule,
  options: DescribeRuleOptions = {},
): { main: string; condition?: string } {
  const { includeRoom = false, labelNasFromLibrary = false } = options

  const isContinue = rule.favourite_name === '__continue__'
  const isPodcast = !!rule.podcast_feed_url
  const isNas = !!rule.nas_uri

  const roomSuffix = includeRoom ? ` in ${rule.room_name ?? 'whole house'}` : ''

  const action = isContinue
    ? `Continue what's already playing${roomSuffix}`
    : isPodcast
      ? `Play latest "${rule.favourite_name}" episode${roomSuffix}`
      : labelNasFromLibrary && isNas
        ? `Play "${rule.favourite_name}" from library${roomSuffix}`
        : `Play "${rule.favourite_name}"${roomSuffix}`

  const days = describeDays(rule.days_of_week)
  let main: string
  if (rule.mode_name) {
    const dayClause = days === 'every day' ? '' : ` on ${days}`
    main = `${action} when "${rule.mode_name}" mode is active${dayClause}.`
  } else if (rule.time_start && rule.time_end) {
    main = `${action} ${days} between ${rule.time_start} and ${rule.time_end}.`
  } else {
    main = `${action} ${days}.`
  }

  let condition: string | undefined
  if (rule.trigger_type === 'if_not_playing') {
    condition = 'Only if nothing is playing.'
  } else if (rule.trigger_type === 'if_source_not') {
    if (includeRoom) {
      // Settings → Music style: explicit "source" prefix
      const source = rule.trigger_value ? ` "${rule.trigger_value}"` : ''
      condition = `Only if source${source} is not active.`
    } else if (rule.trigger_value) {
      condition = `Only if "${rule.trigger_value}" is not active.`
    }
  }

  if (rule.max_plays !== null) {
    const scope = rule.mode_name ? 'per mode change' : 'per day'
    const limitText = rule.max_plays === 1 ? `Plays once ${scope}.` : `Plays ${rule.max_plays} times ${scope}.`
    condition = condition ? `${condition} ${limitText}` : limitText
  }

  return { main, condition }
}

export function describeRuleAccessible(
  rule: AutoPlayRule,
  options: DescribeRuleOptions = {},
): string {
  const { main, condition } = describeRule(rule, options)
  return condition ? `${main} ${condition}` : main
}
