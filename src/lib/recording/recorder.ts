import type { RecordedEvent } from './types'
import { buildSelectors, describeElement, generateEventId, isSensitiveField, maskValue, normaliseUrl } from './utils'

type PendingEvent = Omit<RecordedEvent, 'tabId' | 'frameId'>

const FLUSH_INTERVAL = 600

export class Recorder {
  private recording = false
  private pending: PendingEvent[] = []
  private flushTimer?: number
  private lastKnownUrl = window.location.href
  private originalPushState?: History['pushState']
  private originalReplaceState?: History['replaceState']
  private historyPatched = false

  private handleClick = (event: MouseEvent) => {
    if (!this.recording || !event.isTrusted) {
      return
    }

    if ((window as any).__aipexPlaybackActive) {
      return
    }

    const element = this.resolveElement(event.target, event.composedPath())
    if (!element) {
      return
    }

    const selectors = buildSelectors(element)
    const descriptor = describeElement(element)

    this.enqueue({
      id: generateEventId(),
      type: 'click',
      timestamp: Date.now(),
      url: window.location.href,
      button: event.button,
      selectors,
      descriptor,
    })

    const anchor = element.closest?.('a[href]') as HTMLAnchorElement | null
    if (anchor?.href && anchor.target !== '_blank') {
      this.recordNavigation(window.location.href, anchor.href, 'link')
    }
  }

  private handleInput = (event: Event) => {
    if (!this.recording) {
      return
    }

    if ((window as any).__aipexPlaybackActive) {
      return
    }

    if ('isTrusted' in event && !(event as any).isTrusted) {
      return
    }

    const target = this.resolveElement(event.target, event.composedPath()) as HTMLElement | null
    if (!target) {
      return
    }

    if (isSensitiveField(target)) {
      return
    }

    let value = ''
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      value = target.value
    } else if (target.isContentEditable) {
      value = target.textContent || ''
    }

    const masked = maskValue(value)

    this.enqueue({
      id: generateEventId(),
      type: 'input',
      timestamp: Date.now(),
      url: window.location.href,
      selectors: buildSelectors(target),
      descriptor: describeElement(target),
      value: masked.value,
      masked: masked.masked,
    })
  }

  private handleHashChange = () => {
    this.recordNavigation(this.lastKnownUrl, window.location.href, 'spa')
  }

  private handlePopState = () => {
    this.recordNavigation(this.lastKnownUrl, window.location.href, 'history')
  }

  private recordNavigation(fromUrl: string, toUrl: string, reason: 'link' | 'history' | 'spa' | 'manual') {
    if (!this.recording) {
      return
    }

    if ((window as any).__aipexPlaybackActive) {
      return
    }

    if (!toUrl) {
      return
    }

    const normalisedFrom = normaliseUrl(fromUrl)
    const normalisedTo = normaliseUrl(toUrl)

    if (normalisedFrom === normalisedTo) {
      return
    }

    this.enqueue({
      id: generateEventId(),
      type: 'navigation',
      timestamp: Date.now(),
      url: fromUrl,
      fromUrl,
      toUrl,
      reason,
    })

    this.lastKnownUrl = toUrl
  }

  private resolveElement(target: EventTarget | null, path?: EventTarget[]): Element | null {
    if (target instanceof Element) {
      return target
    }

    if (Array.isArray(path)) {
      const element = path.find((item): item is Element => item instanceof Element)
      if (element) {
        return element
      }
    }

    return null
  }

  private enqueue(event: PendingEvent) {
    this.pending.push(event)
    this.scheduleFlush()
  }

  private scheduleFlush() {
    if (this.flushTimer || this.pending.length === 0) {
      return
    }

    this.flushTimer = window.setTimeout(() => {
      this.flushTimer = undefined
      this.flush()
    }, FLUSH_INTERVAL)
  }

  private flush() {
    if (this.pending.length === 0) {
      return
    }

    const events = [...this.pending]
    this.pending = []

    chrome.runtime.sendMessage({ request: 'recording:add-events', events }, () => {
      if (chrome.runtime.lastError) {
        // Re-queue events if the background script is unavailable
        this.pending.unshift(...events)
      }
    })
  }

  private patchHistory() {
    if (this.historyPatched) {
      return
    }

    this.historyPatched = true
    this.originalPushState = history.pushState
    this.originalReplaceState = history.replaceState

    const capture = (reason: 'spa') => {
      queueMicrotask(() => {
        this.recordNavigation(this.lastKnownUrl, window.location.href, reason)
      })
    }

    history.pushState = ((...args: Parameters<History['pushState']>) => {
      const result = this.originalPushState?.apply(history, args as any)
      capture('spa')
      return result
    }) as History['pushState']

    history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      const result = this.originalReplaceState?.apply(history, args as any)
      capture('spa')
      return result
    }) as History['replaceState']
  }

  private restoreHistory() {
    if (!this.historyPatched) {
      return
    }

    if (this.originalPushState) {
      history.pushState = this.originalPushState
    }
    if (this.originalReplaceState) {
      history.replaceState = this.originalReplaceState
    }

    this.historyPatched = false
  }

  start() {
    if (this.recording) {
      return
    }

    this.recording = true
    this.lastKnownUrl = window.location.href

    window.addEventListener('click', this.handleClick, true)
    document.addEventListener('input', this.handleInput, true)
    document.addEventListener('change', this.handleInput, true)
    window.addEventListener('hashchange', this.handleHashChange)
    window.addEventListener('popstate', this.handlePopState)
    this.patchHistory()
  }

  stop() {
    if (!this.recording) {
      return
    }

    this.recording = false

    window.removeEventListener('click', this.handleClick, true)
    document.removeEventListener('input', this.handleInput, true)
    document.removeEventListener('change', this.handleInput, true)
    window.removeEventListener('hashchange', this.handleHashChange)
    window.removeEventListener('popstate', this.handlePopState)

    this.restoreHistory()
    this.flush()
  }
}
