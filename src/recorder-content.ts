import { Recorder } from './lib/recording/recorder'
import type { RecordedEvent } from './lib/recording/types'
import { summariseSelectors } from './lib/recording/utils'

const recorder = new Recorder()

type PlaybackResponse = { success: boolean; message?: string }

const globalPlaybackFlag = '__aipexPlaybackActive'

declare global {
  interface Window {
    [globalPlaybackFlag]?: boolean
  }
}

function cssEscape(value: string) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  return value.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~\\])/g, '\\$1')
}

function findElement(event: RecordedEvent): Element | null {
  const { selectors, descriptor } = event

  if (selectors?.css) {
    try {
      const element = document.querySelector(selectors.css)
      if (element) {
        return element
      }
    } catch (error) {
      console.warn('Invalid CSS selector from recording', selectors.css, error)
    }
  }

  if (selectors?.xpath) {
    try {
      const result = document.evaluate(
        selectors.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      )
      const node = result.singleNodeValue
      if (node instanceof Element) {
        return node
      }
    } catch (error) {
      console.warn('Invalid XPath from recording', selectors.xpath, error)
    }
  }

  if (descriptor?.id) {
    const element = document.getElementById(descriptor.id)
    if (element) {
      return element
    }
  }

  if (descriptor?.ariaLabel) {
    const element = document.querySelector(`[aria-label="${cssEscape(descriptor.ariaLabel)}"]`)
    if (element) {
      return element
    }
  }

  if (descriptor?.role) {
    const element = document.querySelector(`[role="${cssEscape(descriptor.role)}"]`)
    if (element) {
      return element
    }
  }

  if (descriptor?.textSnippet) {
    const snippet = descriptor.textSnippet.trim()
    if (snippet) {
      const iterator = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
      let node: Node | null = iterator.currentNode
      let safetyCounter = 0
      while ((node = iterator.nextNode()) && safetyCounter < 5000) {
        safetyCounter += 1
        if (node instanceof Element) {
          const text = node.textContent?.replace(/\s+/g, ' ').trim()
          if (text && text.includes(snippet)) {
            return node
          }
        }
      }
    }
  }

  return null
}

async function wait(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function performClick(element: Element) {
  if ('scrollIntoView' in element) {
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }

  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true })
  }

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
  }

  element.dispatchEvent(new MouseEvent('pointerdown', eventInit))
  element.dispatchEvent(new MouseEvent('mousedown', eventInit))
  element.dispatchEvent(new MouseEvent('mouseup', eventInit))
  element.dispatchEvent(new MouseEvent('click', eventInit))
}

async function performInput(element: Element, value: string, speed: number) {
  const writableElement = element as HTMLElement & { value?: string }

  if (writableElement instanceof HTMLInputElement || writableElement instanceof HTMLTextAreaElement) {
    writableElement.value = ''
  } else if (writableElement.isContentEditable) {
    writableElement.textContent = ''
  }

  writableElement.dispatchEvent(new Event('input', { bubbles: true }))

  const characters = Array.from(value)
  if (characters.length === 0) {
    return
  }

  const delay = Math.max(30, Math.floor(140 / Math.max(speed, 0.25)))

  let currentValue = ''
  for (const char of characters) {
    currentValue += char

    if (writableElement instanceof HTMLInputElement || writableElement instanceof HTMLTextAreaElement) {
      writableElement.value = currentValue
    } else if (writableElement.isContentEditable) {
      writableElement.textContent = currentValue
    }

    const inputEvent = typeof InputEvent === 'function'
      ? new InputEvent('input', {
        bubbles: true,
        data: char,
        inputType: 'insertText',
      })
      : new Event('input', { bubbles: true })

    writableElement.dispatchEvent(inputEvent)
    await wait(delay)
  }
}

async function handlePlaybackEvent(event: RecordedEvent, speed: number): Promise<PlaybackResponse> {
  try {
    if (event.type === 'navigation') {
      if (window.location.href === event.toUrl) {
        return { success: true }
      }
      window.location.href = event.toUrl
      return { success: true }
    }

    const element = findElement(event)
    if (!element) {
      return {
        success: false,
        message: `Element not found for ${summariseSelectors(event.selectors, event.descriptor)}`,
      }
    }

    window[globalPlaybackFlag] = true

    if (event.type === 'click') {
      await performClick(element)
    } else if (event.type === 'input') {
      await performInput(element, event.value, speed)
    }

    return { success: true }
  } catch (error) {
    console.error('Playback failed', error)
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  } finally {
    window[globalPlaybackFlag] = false
  }
}

async function syncInitialState() {
  try {
    const response = await chrome.runtime.sendMessage({ request: 'recording:get-state' })
    if (response?.state?.active) {
      recorder.start()
    }
  } catch (error) {
    console.debug('Recorder content script failed to sync state', error)
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.request) {
    case 'recording:start':
      recorder.start()
      sendResponse({ ok: true })
      return true
    case 'recording:stop':
      recorder.stop()
      sendResponse({ ok: true })
      return true
    case 'playback:perform':
      handlePlaybackEvent(message.event, message.speed ?? 1)
        .then(sendResponse)
        .catch((error) => sendResponse({ success: false, message: String(error) }))
      return true
    default:
      break
  }
  return false
})

syncInitialState()
