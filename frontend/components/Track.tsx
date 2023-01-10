import { Box, Flex, HStack, VStack } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { SplitGridContext } from "../contexts/SplitGridContext";
import ErrorBoundary from "./ErrorBoundary";
import GridCell from "./GridCell";
import { GridDivider } from "./GridDivider";

const Track = ({
  index,
  height,
  width,
}: {
  index: number;
  height: string;
  width: string;
}): ReactElement => {
  const splitGridContext = useContext(SplitGridContext);
  const trackState = splitGridContext.tracks[index];
  return (
    <Flex className="track" height={height} width={width} flexDirection="column">
      <Box backgroundColor="grey" width="full">
        {trackState.name}
      </Box>
      <Flex flexDirection="row" height="full" width="full">
        {splitGridContext.splits.map((split, splitIndex: number) => {
          return (
            <ErrorBoundary key={splitIndex}>
              <HStack spacing="0px" height="full" width={`${split.widthPct}%`}>
                <GridCell trackIndex={index} splitIndex={splitIndex} height="full" width="full">
                  <div>Hi</div>
                </GridCell>
                {splitIndex != splitGridContext.splits.length - 1 && (
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
