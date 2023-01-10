import { Box } from "@chakra-ui/react";
import { ReactElement, useContext, useRef } from "react";

import { SplitGridContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX, SPLIT_GRID_HEIGHT_FRACTION } from "../lib/constants";
import LOG from "../lib/logger";
import { sum } from "../lib/util";

export type DividerOrientation = "horizontal" | "vertical";

// Minimum size that a split or track can be resized as percent of the split grid
const MIN_CELL_PCT = 2;

export const GridDivider = ({
  height,
  width,
  index,
  orientation,
}: {
  height: string | number;
  width: string | number;
  index: number;
  orientation: "horizontal" | "vertical";
}): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  const context = useContext(SplitGridContext);

  const adjustDimensions = ({
    currentDimensions,
    mousePosPct,
  }: {
    currentDimensions: number[];
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

  const handleMouseMove = (ev: MouseEvent) => {
    if (ref.current === null) {
      LOG.error("Missing ref for GridDivider!");
      return;
    }
    if (ref.current === null) {
      return;
    }
    if (orientation === "horizontal") {
      const mousePosPct =
        (ev.clientY / window.innerHeight - (1 - SPLIT_GRID_HEIGHT_FRACTION)) * 100;
      const currentDimensions = Array.from(context.tracks.map((track) => track.heightPct));
      const updatedTrackHeights = adjustDimensions({
        mousePosPct,
        currentDimensions,
      });
      LOG.debug(
        `Handling divider drag event: mousePos=${ev.clientY}; ` +
          `windowHeight=${window.innerHeight}; mousePosPct=${mousePosPct}; ` +
          `initialTrackHeights=${currentDimensions} updatedTrackHeights=${updatedTrackHeights}`
      );
      context.setTrackHeights(updatedTrackHeights);
    } else if (orientation === "vertical") {
      // We'll need to adjust this if the split grid doesn't fill entire window width in future
      const mousePosPct = (ev.clientX / window.innerWidth) * 100;
      const currentDimensions = Array.from(context.splits.map((split) => split.widthPct));
      const updatedSplitWidths = adjustDimensions({
        mousePosPct,
        currentDimensions,
      });
      LOG.debug(
        `Handling divider drag event: mousePos=${ev.clientY}; ` +
          `windowWidth=${window.innerWidth}; mousePosPct=${mousePosPct}; ` +
          `initialSplitWidths=${currentDimensions} updatedSplitWidths=${updatedSplitWidths}`
      );
      context.setSplitWidths(updatedSplitWidths);
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
      ref={ref}
      cursor={orientation === "horizontal" ? "row-resize" : "col-resize"}
      backgroundColor="#000"
      height={height}
      width={width}
      onMouseDown={handleMouseDown}
    ></Box>
  );
};
