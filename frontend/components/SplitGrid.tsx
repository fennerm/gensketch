import { Box, Flex } from "@chakra-ui/react";
import { ReactElement, useContext, useRef } from "react";

import { SplitGridContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";
import RefSeqArea from "./RefSeqArea";
import Track from "./Track";

const SplitGrid = ({ height, width }: { height: string; width: string }): ReactElement => {
  const context = useContext(SplitGridContext);
  const ref = useRef<HTMLDivElement>(null);
  const numSplits = context.splits.length;
  const numTracks = context.tracks.length;

  return (
    <Box className="split-grid" ref={ref} height={height} width={width}>
      <Flex className="tracks" height="98%" flexDirection="column">
        {context.tracks.map((track, trackIndex: number) => {
          return (
            <ErrorBoundary key={trackIndex}>
              <Track index={trackIndex} height={`${track.heightPct}%`} width="full"></Track>
              {trackIndex != numTracks - 1 && (
                <GridDivider
                  height={`${DIVIDER_PX}px`}
                  width="full"
                  index={trackIndex}
                  orientation="horizontal"
                />
              )}
            </ErrorBoundary>
          );
        })}
      </Flex>
      <RefSeqArea height="2%" width={width} />
    </Box>
  );
};

export default SplitGrid;
