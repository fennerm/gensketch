import { Box, Flex, HStack, Text } from "@chakra-ui/react";
import { ReactElement, RefObject, useContext, useState } from "react";

import { GenomicRegion } from "../bindings";
import { TrackState } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import { Size } from "../lib/types";
import AlignmentsView from "./AlignmentsView";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";

const TRACK_LABEL_HEIGHT = "34px";

export interface SplitState {
  id: string;
  widthPct: number;
  focusedRegion: GenomicRegion | null;
}

const Track = <T extends HTMLElement>({
  height,
  width,
  trackData,
  splitGridRef,
  splits,
}: {
  height: Size;
  width: Size;
  readonly trackData: TrackState;
  readonly splitGridRef: RefObject<T>;
  readonly splits: SplitState[];
}): ReactElement => {
  return (
    <Flex className="track" height={height} width={width} flexDirection="column">
      <Box
        className="track-label"
        height={`${TRACK_LABEL_HEIGHT}`}
        width="full"
        fontSize="12px"
        backgroundColor="brand.trackLabelBackground"
      >
        <Text color="brand.secondaryText">{trackData.name}</Text>
      </Box>
      <Flex
        className="split-container"
        flexDirection="row"
        style={{ height: `calc(100% - ${TRACK_LABEL_HEIGHT})` }}
      >
        {splits.map((split, splitIndex: number) => {
          return (
            <ErrorBoundary key={splitIndex}>
              <HStack className="split" spacing="0px" height="full" width={`${split.widthPct}%`}>
                <AlignmentsView
                  trackId={trackData.id}
                  splitId={split.id}
                  style={{ width: `calc(100% - ${DIVIDER_PX}px)` }}
                  height="full"
                />
                {splitIndex != splits.length - 1 && (
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
