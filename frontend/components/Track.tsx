import { Box, Flex, HStack } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { AlignmentsContext, SplitContext, TrackState } from "../contexts/SplitGridContext";
import AlignmentsView from "./AlignmentsView";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";

const Track = ({
  height,
  width,
  trackData,
}: {
  height: string;
  width: string;
  trackData: TrackState;
}): ReactElement => {
  const splitContext = useContext(SplitContext);
  const alignmentsContext = useContext(AlignmentsContext);

  return (
    <Flex className="track" height={height} width={width} flexDirection="column">
      <Box className="track-label" backgroundColor="grey" width="full">
        {trackData.name}
      </Box>
      <Flex className="split-container" flexDirection="row" height="full" width="full">
        {splitContext.splits.map((split, splitIndex: number) => {
          return (
            <ErrorBoundary key={splitIndex}>
              <HStack className="split" spacing="0px" height="full" width={`${split.widthPct}%`}>
                <AlignmentsView
                  trackId={trackData.id}
                  splitId={split.id}
                  width="full"
                  height="full"
                />
                {splitIndex != splitContext.splits.length - 1 && (
                  <GridDivider
                    height="full"
                    width="2px"
                    orientation={"vertical"}
                    index={splitIndex}
                  />
                )}
              </HStack>
            </ErrorBoundary>
          );
        })}
      </Flex>
    </Flex>
  );
};

export default Track;
