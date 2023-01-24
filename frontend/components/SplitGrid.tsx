import { Box, Flex } from "@chakra-ui/react";
import { ReactElement, useContext, useRef } from "react";

import { TrackContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";
import RefSeqArea from "./RefSeqArea";
import Track from "./Track";

const SplitGrid = ({
  height,
  width,
}: {
  height: string | number;
  width: string | number;
}): ReactElement => {
  const trackContext = useContext(TrackContext);
  const ref = useRef<HTMLDivElement>(null);
  const numTracks = trackContext.tracks.length;

  const refSeqHeight = "20px";

  return (
    <Box className="split-grid" ref={ref} height={height} width={width}>
      <Flex
        className="tracks"
        style={{ height: `calc(100% - ${refSeqHeight})` }}
        width="full"
        flexDirection="column"
      >
        {trackContext.tracks.map((track, trackIndex: number) => {
          return (
            <ErrorBoundary key={trackIndex}>
              <Track trackData={track} height={`${track.heightPct}%`} width="full"></Track>
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
      <RefSeqArea height={refSeqHeight} width="full" />
    </Box>
  );
};

export default SplitGrid;
