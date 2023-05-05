/** Shared type definitions which are used throughout the application. */
export interface Dimensions {
  width: number;
  height: number;
}

// Copied from tauri since they don't export this interface for some reason
export interface Event<T> {
  // Event name
  event: string;
  // The label of the window that emitted this event.
  windowLabel: string;
  // Event identifier used to unlisten
  id: number;
  // Event payload
  payload: T;
}

export type EventCallback<T> = (event: Event<T>) => void;

export type UnlistenFn = () => void;

export type EventListener<T> = (callback: EventCallback<T>) => Promise<UnlistenFn>;

export interface Position {
  x: number;
  y: number;
}

export function assertIsDefined<T>(value: T): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(`${value} is not defined`);
  }
}

export type PrimaryIUPACNucleotide = "A" | "G" | "C" | "T";

export type SecondaryIUPACNucleotide =
  | "N"
  | "R"
  | "Y"
  | "K"
  | "M"
  | "S"
  | "W"
  | "B"
  | "D"
  | "H"
  | "V"
  | "GAP";

export type IUPACNucleotide = PrimaryIUPACNucleotide | SecondaryIUPACNucleotide;

export type DividerOrientation = "horizontal" | "vertical";

export type MouseHandler = (mousePos: Position) => void;
