export type Size = string | number;

export interface Dimensions {
  width: Size;
  height: Size;
}

export interface Event<T> {
  /** Event name */
  event: string;
  /** The label of the window that emitted this event. */
  windowLabel: string;
  /** Event identifier used to unlisten */
  id: number;
  /** Event payload */
  payload: T;
}

export type EventCallback<T> = (event: Event<T>) => void;

export type UnlistenFn = () => void;

export type EventListener<T> = (callback: EventCallback<T>) => Promise<UnlistenFn>;

export interface Point {
  x: number;
  y: number;
}
