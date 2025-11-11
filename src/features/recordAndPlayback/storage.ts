import { AnyRecordedEvent } from './events';

const MAX_EVENTS = 5000;
const STORAGE_KEY = 'recorded_events';

export async function getEvents(): Promise<AnyRecordedEvent[]> {
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return result[STORAGE_KEY] || [];
}

export async function addEvent(event: AnyRecordedEvent): Promise<void> {
  const events = await getEvents();
  events.push(event);

  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: events });
}

export async function clearEvents(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
