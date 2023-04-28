import type { SplitData, TrackData } from "@lib/bindings";
import type { Position } from "@lib/types";

export interface SplitState extends SplitData {
  widthPct: number;
}

export interface TrackState extends TrackData {
  heightPct: number;
}

export type DividerDragHandler = ({
  mousePos,
  dividerIndex,
}: {
  mousePos: Position;
  dividerIndex: number;
}) => void;
