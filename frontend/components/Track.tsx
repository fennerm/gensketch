import { Box, Flex, HStack } from "@chakra-ui/react";
import { ReactElement, RefObject, useContext } from "react";

import { SplitContext, TrackState } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import { Size } from "../lib/types";
import AlignmentsView from "./AlignmentsView";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";

const Track = <T extends HTMLElement>({
  height,
  width,
  trackData,
  splitGridRef,
}: {
  height: Size;
  width: Size;
  readonly trackData: TrackState;
  readonly splitGridRef: RefObject<T>;
}): ReactElement => {
  const splitContext = useContext(SplitContext);

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
                  style={{ width: `calc(100% - ${DIVIDER_PX}px)` }}
                  height="full"
                />
                {splitIndex != splitContext.splits.length - 1 && (
                  <GridDivider
                    height="full"
                    width={`${DIVIDER_PX}px`}
                    orientation={"vertical"}
                    index={splitIndex}
                    splitGridRef={splitGridRef}
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
