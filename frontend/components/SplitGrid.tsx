import { Box, Flex } from "@chakra-ui/react";
import { ReactElement, useContext, useRef } from "react";

import { TrackContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import { Size } from "../lib/types";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";
import RefSeqArea from "./RefSeqArea";
import Track from "./Track";

const SplitGrid = ({ height, width }: { height: Size; width: Size }): ReactElement => {
  const trackContext = useContext(TrackContext);
  const ref = useRef<HTMLDivElement>(null);

  const refSeqHeight = "20px";

  return (
    <Box className="split-grid" ref={ref} height={height} width={width}>
      <RefSeqArea height={refSeqHeight} width="full" splitGridRef={ref} />
      <Flex
        className="tracks"
        style={{ height: `calc(100% - ${refSeqHeight})` }}
        width="full"
        flexDirection="column"
      >
        {trackContext.tracks.map((track, trackIndex: number) => {
          return (
            <ErrorBoundary key={trackIndex}>
              <Track
                trackData={track}
                height={`${track.heightPct}%`}
                width="full"
                splitGridRef={ref}
              ></Track>
              {trackIndex != trackContext.tracks.length - 1 && (
                <GridDivider
                  height={`${DIVIDER_PX}px`}
                  width="full"
                  index={trackIndex}
                  orientation="horizontal"
                  splitGridRef={ref}
                />
              )}
            </ErrorBoundary>
          );
        })}
      </Flex>
    </Box>
  );
};

export default SplitGrid;
