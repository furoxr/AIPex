export enum RecordedEventType {
  CLICK = 'click',
  INPUT = 'input',
  NAVIGATE = 'navigate',
  TAB_SWITCH = 'tab_switch',
}

export interface RecordedEvent {
  type: RecordedEventType;
  timestamp: number;
  url: string;
}

export interface ClickEvent extends RecordedEvent {
  type: RecordedEventType.CLICK;
  selector: string;
  xpath: string;
  elementDescription?: string;
}

export interface InputEvent extends RecordedEvent {
  type: RecordedEventType.INPUT;
  selector: string;
  xpath: string;
  value: string;
  elementDescription?: string;
}

export interface NavigateEvent extends RecordedEvent {
  type: RecordedEventType.NAVIGATE;
  from: string;
  to: string;
}

export interface TabSwitchEvent extends RecordedEvent {
  type: RecordedEventType.TAB_SWITCH;
  tabId: number;
}

export type AnyRecordedEvent = ClickEvent | InputEvent | NavigateEvent | TabSwitchEvent;
