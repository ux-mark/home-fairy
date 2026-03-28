export interface SectionOrderItem {
  id: string
  visible: boolean
}

export const DEFAULT_SECTION_ORDER: SectionOrderItem[] = [
  { id: 'mta', visible: true },
  { id: 'quick-actions', visible: true },
  { id: 'music', visible: true },
  { id: 'weather', visible: true },
  { id: 'mode-selector', visible: true },
  { id: 'rooms', visible: true },
]
