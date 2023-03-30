import type { SplitData, TrackData } from "@lib/bindings";

export interface SplitState extends SplitData {
  widthPct: number;
}

export interface TrackState extends TrackData {
  heightPct: number;
}

export type DividerDragHandler = ({mouseEvent, dividerIndex}: {mouseEvent: MouseEvent, dividerIndex: number}) => void;
