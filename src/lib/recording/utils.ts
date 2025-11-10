import type { ElementDescriptor, ElementSelectors } from './types'

const SENSITIVE_FIELD_PATTERN = /(password|passcode|cc-|card|cvc|cvv|ssn|social|iban|swift)/i

export const MAX_EVENTS = 5000

export function generateEventId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function escapeCssIdentifier(value: string) {
  return value.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~\\])/g, '\\$1')
}

export function getCssSelector(element: Element): string {
  if (!(element instanceof Element)) {
    return ''
  }

  const segments: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase()

    if (current.id) {
      selector += `#${escapeCssIdentifier(current.id)}`
      segments.unshift(selector)
      break
    }

    const siblingSelectors = Array.from(current.parentElement?.children || [])
      .filter((child) => child.tagName === current.tagName)

    if (siblingSelectors.length > 1) {
      const index = siblingSelectors.indexOf(current) + 1
      selector += `:nth-of-type(${index})`
    }

    if (current.classList.length > 0) {
      selector += `.${Array.from(current.classList)
        .map((cls) => escapeCssIdentifier(cls))
        .join('.')}`
    }

    segments.unshift(selector)
    current = current.parentElement
  }

  return segments.join(' > ')
}

export function getXPath(element: Element): string {
  if (!(element instanceof Element)) {
    return ''
  }

  const segments: string[] = []
  let current: Element | null = element

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = current.tagName.toLowerCase()
    const siblings = current.parentElement
      ? Array.from(current.parentElement.children).filter((child) => child.tagName === current.tagName)
      : []

    if (!current.parentElement) {
      segments.unshift(`/${tagName}`)
      break
    }

    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1
      segments.unshift(`/${tagName}[${index}]`)
    } else {
      segments.unshift(`/${tagName}`)
    }

    current = current.parentElement
  }

  return segments.join('')
}

export function describeElement(element: Element): ElementDescriptor {
  const textContent = element.textContent?.trim().replace(/\s+/g, ' ') || ''
  const snippet = textContent ? textContent.slice(0, 60) : undefined

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || undefined,
    classList: element.classList?.length ? Array.from(element.classList) : undefined,
    name: (element as HTMLInputElement).name || undefined,
    ariaLabel: element.getAttribute?.('aria-label') || undefined,
    role: element.getAttribute?.('role') || undefined,
    textSnippet: snippet,
  }
}

export function buildSelectors(element: Element): ElementSelectors {
  return {
    css: getCssSelector(element),
    xpath: getXPath(element),
  }
}

export function isSensitiveField(element: Element): boolean {
  if (element instanceof HTMLInputElement) {
    const type = element.type?.toLowerCase()
    if (['password', 'email', 'tel', 'number'].includes(type)) {
      return true
    }
  }

  const attributesToCheck = ['autocomplete', 'name', 'id']
  return attributesToCheck.some((attr) => {
    const value = element.getAttribute?.(attr)
    return value ? SENSITIVE_FIELD_PATTERN.test(value) : false
  })
}

export function maskValue(value: string): { value: string; masked: boolean } {
  if (!value) {
    return { value: '', masked: false }
  }

  const trimmed = value.slice(0, 200)
  if (trimmed.length <= 3) {
    return { value: '*'.repeat(trimmed.length), masked: true }
  }

  const masked = `${trimmed.slice(0, 3)}${'*'.repeat(trimmed.length - 3)}`
  return { value: masked, masked: true }
}

export function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}

export function summariseSelectors(selectors?: ElementSelectors, descriptor?: ElementDescriptor) {
  if (selectors?.css) {
    return selectors.css
  }
  if (descriptor?.id) {
    return `#${descriptor.id}`
  }
  if (descriptor?.ariaLabel) {
    return `[aria-label="${descriptor.ariaLabel}"]`
  }
  if (descriptor?.textSnippet) {
    return descriptor.textSnippet
  }
  return 'element'
}
