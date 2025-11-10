export type ElementSelectors = {
  css?: string
  xpath?: string
}

export type ElementDescriptor = {
  tagName: string
  id?: string
  classList?: string[]
  name?: string
  ariaLabel?: string
  role?: string
  textSnippet?: string
}

export interface RecordedEventBase {
  id: string
  type: 'click' | 'input' | 'navigation' | 'tab'
  timestamp: number
  url: string
  tabId?: number
  frameId?: number
  selectors?: ElementSelectors
  descriptor?: ElementDescriptor
  note?: string
}

export interface ClickRecordedEvent extends RecordedEventBase {
  type: 'click'
  button: number
}

export interface InputRecordedEvent extends RecordedEventBase {
  type: 'input'
  value: string
  masked: boolean
}

export interface NavigationRecordedEvent extends RecordedEventBase {
  type: 'navigation'
  fromUrl: string
  toUrl: string
  reason: 'link' | 'history' | 'spa' | 'manual'
}

export interface TabSwitchRecordedEvent extends RecordedEventBase {
  type: 'tab'
  targetTabId: number
  targetUrl?: string
  windowId?: number
}

export type RecordedEvent =
  | ClickRecordedEvent
  | InputRecordedEvent
  | NavigationRecordedEvent
  | TabSwitchRecordedEvent

export interface RecordingState {
  active: boolean
  startedAt?: number
}

export interface PlaybackStatus {
  active: boolean
  paused: boolean
  speed: number
  index: number
  total: number
  currentEvent?: RecordedEvent
  startedAt?: number
}

export interface RecordingSnapshot {
  events: RecordedEvent[]
  state: RecordingState
  playback: PlaybackStatus
}
