import { Box, Flex, HStack } from "@chakra-ui/react";
import { ReactElement, RefObject, useContext } from "react";

import { SplitContext, TrackState } from "../contexts/SplitGridContext";
import { UserConfigContext } from "../contexts/UserConfigContext";
import { DIVIDER_PX } from "../lib/constants";
import { Size } from "../lib/types";
import { hexToString } from "../lib/util";
import AlignmentsView from "./AlignmentsView";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";

const TRACK_LABEL_HEIGHT = "34px";

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
  const userConfigContext = useContext(UserConfigContext);

  return (
    <Flex className="track" height={height} width={width} flexDirection="column">
      <Box
        className="track-label"
        height={`${TRACK_LABEL_HEIGHT}`}
        width="full"
        fontSize="12px"
        color={hexToString(userConfigContext.styles.colors.trackLabelText)}
        backgroundColor={hexToString(userConfigContext.styles.colors.trackLabelBackground)}
      >
        {trackData.name}
      </Box>
      <Flex
        className="split-container"
        flexDirection="row"
        style={{ height: `calc(100% - ${TRACK_LABEL_HEIGHT})` }}
      >
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
