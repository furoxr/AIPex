import { addEvent } from './storage';
import { ClickEvent, InputEvent, RecordedEventType } from './events';

function getCssSelector(element: HTMLElement): string {
  if (!element) return '';
  const path: string[] = [];
  while (element.nodeType === Node.ELEMENT_NODE) {
    let selector = element.nodeName.toLowerCase();
    if (element.id) {
      selector += '#' + element.id;
      path.unshift(selector);
      break;
    } else {
      let sibling = element;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling as HTMLElement)) {
        if (sibling.nodeName.toLowerCase() === selector) nth++;
      }
      if (nth !== 1) selector += `:nth-of-type(${nth})`;
    }
    path.unshift(selector);
    element = element.parentNode as HTMLElement;
  }
  return path.join(' > ');
}

function getXPath(element: HTMLElement): string {
  if (element.id !== '') return `id("${element.id}")`;
  if (element === document.body) return element.tagName;

  let ix = 0;
  const siblings = element.parentNode?.children || new HTMLCollection();
  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element)
      return (
        getXPath(element.parentNode as HTMLElement) +
        '/' +
        element.tagName +
        '[' +
        (ix + 1) +
        ']'
      );
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) ix++;
  }
  return '';
}

export class Recorder {
  private isRecording = false;

  constructor() {
    this.onClick = this.onClick.bind(this);
    this.onInput = this.onInput.bind(this);
  }

  start() {
    if (this.isRecording) return;
    this.isRecording = true;
    window.addEventListener('click', this.onClick, true);
    window.addEventListener('input', this.onInput, true);
  }

  stop() {
    if (!this.isRecording) return;
    this.isRecording = false;
    window.removeEventListener('click', this.onClick, true);
    window.removeEventListener('input', this.onInput, true);
  }

  private onClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const clickEvent: ClickEvent = {
      type: RecordedEventType.CLICK,
      timestamp: Date.now(),
      url: window.location.href,
      selector: getCssSelector(target),
      xpath: getXPath(target),
      elementDescription: target.innerText?.substring(0, 20),
    };
    addEvent(clickEvent);
  }

  private onInput(event: Event) {
    const target = event.target as HTMLInputElement;
    // Mask password input
    const value =
      target.type === 'password'
        ? '********'
        : target.value.substring(0, 3) + '***';

    const inputEvent: InputEvent = {
      type: RecordedEventType.INPUT,
      timestamp: Date.now(),
      url: window.location.href,
      selector: getCssSelector(target),
      xpath: getXPath(target),
      value,
      elementDescription: target.ariaLabel || target.name,
    };
    addEvent(inputEvent);
  }
}
