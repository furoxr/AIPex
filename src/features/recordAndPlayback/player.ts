import { getEvents } from './storage';
import { AnyRecordedEvent, RecordedEventType } from './events';

export class Player {
  private events: AnyRecordedEvent[] = [];
  private currentEventIndex = 0;
  private isPlaying = false;

  async loadEvents() {
    this.events = await getEvents();
  }

  play() {
    if (this.isPlaying || this.events.length === 0) return;
    this.isPlaying = true;
    this.currentEventIndex = 0;
    this.playNextEvent();
  }

  pause() {
    this.isPlaying = false;
  }

  resume() {
    if (this.isPlaying || this.events.length === 0) return;
    this.isPlaying = true;
    this.playNextEvent();
  }

  private playNextEvent() {
    if (!this.isPlaying || this.currentEventIndex >= this.events.length) {
      this.isPlaying = false;
      return;
    }

    const event = this.events[this.currentEventIndex];
    this.executeEvent(event).then(() => {
      this.currentEventIndex++;
      this.playNextEvent();
    });
  }

  private async executeEvent(event: AnyRecordedEvent) {
    switch (event.type) {
      case RecordedEventType.CLICK:
        // Logic to execute click event
        await this.sendMessageToContentScript({ action: 'executeClick', event });
        break;
      case RecordedEventType.INPUT:
        // Logic to execute input event
        await this.sendMessageToContentScript({ action: 'executeInput', event });
        break;
      case RecordedEventType.NAVIGATE:
        // Logic to execute navigate event
        await chrome.tabs.update({ url: event.to });
        break;
      case RecordedEventType.TAB_SWITCH:
        // Logic to execute tab switch event
        await chrome.tabs.update(event.tabId, { active: true });
        break;
    }
    // Add a delay to simulate real user interaction
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  private async sendMessageToContentScript(message: any) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].id) {
      return new Promise(resolve => {
        chrome.tabs.sendMessage(tabs[0].id as number, message, response => {
          resolve(response);
        });
      });
    }
  }
}
