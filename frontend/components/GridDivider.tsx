import { Box } from "@chakra-ui/react";
import { ReactElement, RefObject, useContext, useRef } from "react";

import { SplitContext, SplitGridApiContext, TrackContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import LOG from "../lib/logger";
import { Size } from "../lib/types";
import { sum } from "../lib/util";

export type DividerOrientation = "horizontal" | "vertical";

// Minimum size that a split or track can be resized as percent of the split grid
const MIN_CELL_PCT = 2;

/**
 * Divider between tracks/splits in the split grid which can be dragged to resize.
 *
 * @param props
 * @param index = The index of the divider in the grid. E.g the 3rd horizontal divider has index=2.
 * @param props.orientation = "horizontal" if this is a divider between tracks. "vertical" if this
 *  is a divider between splits.
 */
export const GridDivider = <T extends HTMLElement>({
  height,
  width,
  index,
  orientation,
  splitGridRef,
}: {
  height: Size;
  width: Size;
  index: number;
  readonly orientation: DividerOrientation;
  readonly splitGridRef: RefObject<T>;
}): ReactElement => {
  const trackContext = useContext(TrackContext);
  const splitContext = useContext(SplitContext);
  const splitGridApi = useContext(SplitGridApiContext);
  // const ref = useRef<HTMLDivElement>(null);

  const adjustDimensions = ({
    currentDimensions,
    mousePosPct,
  }: {
    readonly currentDimensions: number[];
    mousePosPct: number;
  }): number[] => {
    // E.g start with 33%, 33%, 33%
    // Divider 0 moved to 10%
    // Set track 0 to 10%
    // Set other tracks to (33 - 23/2)%
    //
    // Calculate a cumulative sum of the splits/tracks up to the current one. This is used to
    // determine where the mouse in relation to the current split/track.
    const cumSumDim = sum(currentDimensions.slice(0, index + 1));
    let diff = mousePosPct - cumSumDim + (DIVIDER_PX / window.innerHeight) * 100;
    if (currentDimensions[index] + diff < MIN_CELL_PCT) {
      diff = MIN_CELL_PCT - currentDimensions[index];
    } else if (currentDimensions[index + 1] - diff < MIN_CELL_PCT) {
      diff = currentDimensions[index + 1] - MIN_CELL_PCT;
    }
    const updatedDimensions = Array.from(
      currentDimensions.map((dim, dimIndex) => {
        if (dimIndex === index) {
          return dim + diff;
        } else if (dimIndex === index + 1) {
          return dim - diff;
        } else {
          return dim;
        }
      })
    );
    return updatedDimensions;
  };

  const getMouseYPosPct = ({
    splitGridElement,
    mouseYPos,
  }: {
    readonly splitGridElement: T;
    mouseYPos: number;
  }) => {
    return ((mouseYPos - splitGridElement.offsetTop) / splitGridElement.offsetHeight) * 100;
  };

  const getMouseXPosPct = ({
    splitGridElement,
    mouseXPos,
  }: {
    readonly splitGridElement: T;
    mouseXPos: number;
  }) => {
    return ((mouseXPos - splitGridElement.offsetLeft) / splitGridElement.offsetWidth) * 100;
  };

  const horizontalResize = ({
    splitGridElement,
    mouseYPos,
  }: {
    readonly splitGridElement: T;
    mouseYPos: number;
  }): void => {
    const mousePosPct = getMouseYPosPct({ splitGridElement, mouseYPos });
    // const mousePosPct = (mouseYPos / window.innerHeight - (1 - SPLIT_GRID_HEIGHT_FRACTION)) * 100;
    const currentDimensions = Array.from(trackContext.tracks.map((track) => track.heightPct));
    const updatedTrackHeights = adjustDimensions({
      mousePosPct,
      currentDimensions,
    });
    LOG.debug(
      `Handling divider drag event: mousePos=${mouseYPos}; ` +
        `windowHeight=${window.innerHeight}; mousePosPct=${mousePosPct}; ` +
        `initialTrackHeights=${currentDimensions} updatedTrackHeights=${updatedTrackHeights}`
    );
    splitGridApi.setTrackHeights(updatedTrackHeights);
  };

  const verticalResize = ({
    splitGridElement,
    mouseXPos,
  }: {
    readonly splitGridElement: T;
    mouseXPos: number;
  }): void => {
    const mousePosPct = getMouseXPosPct({ splitGridElement, mouseXPos });
    // const mousePosPct = (mouseXPos / window.innerWidth) * 100;
    const currentDimensions = Array.from(splitContext.splits.map((split) => split.widthPct));
    const updatedSplitWidths = adjustDimensions({
      mousePosPct,
      currentDimensions,
    });
    LOG.debug(
      `Handling divider drag event: mousePos=${mouseXPos}; ` +
        `windowWidth=${window.innerWidth}; mousePosPct=${mousePosPct}; ` +
        `initialSplitWidths=${currentDimensions} updatedSplitWidths=${updatedSplitWidths}`
    );
    splitGridApi.setSplitWidths(updatedSplitWidths);
  };

  const handleMouseMove = (ev: MouseEvent) => {
    const splitGridElement = splitGridRef.current;
    if (splitGridElement === null) {
      return;
    }
    if (orientation === "horizontal") {
      horizontalResize({ splitGridElement, mouseYPos: ev.clientY });
    } else if (orientation === "vertical") {
      verticalResize({ splitGridElement, mouseXPos: ev.clientX });
    }
  };

  const handleMouseDown = (): void => {
    console.log("Dragging divider...");
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseUp = (): void => {
    console.log("Stopped dragging divider...");
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  };

  return (
    <Box
      className="grid-divider"
      cursor={orientation === "horizontal" ? "row-resize" : "col-resize"}
      backgroundColor="#000"
      height={height}
      width={width}
      onMouseDown={handleMouseDown}
    ></Box>
  );
};
