import { Flex, HStack, keyframes } from "@chakra-ui/react";
import { ReactElement, useContext, useEffect, useRef, useState } from "react";

import { SplitGridContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";
import RefSeqView from "./RefSeqView";

const RefSeqArea = ({ height, width }: { height: string; width: string }): ReactElement => {
  const splitGridContext = useContext(SplitGridContext);
  const ref = useRef<HTMLDivElement>(null);

  // Width "full" doesn't seem to be working well here for some reason. Perhaps due to some
  // interaction with the canvas element in RefSeqView?
  const calcViewWidth = (splitIndex: number, splitWidth: number): number => {
    if (ref.current === null) {
      return 0;
    }
    let dividerWidth = DIVIDER_PX;
    if (splitIndex == splitGridContext.splits.length - 1) {
      dividerWidth = 0;
    }
    return (splitWidth / 100) * window.innerWidth - dividerWidth;
  };

  const viewWidths = Array.from(
    splitGridContext.splits.map((split, index) => calcViewWidth(index, split.widthPct)).values()
  );

  return (
    <Flex className="ref-seq-area" ref={ref} height={height} width={width}>
      {splitGridContext.splits.map((split, splitIndex: number) => {
        return (
          <ErrorBoundary key={splitIndex}>
            <HStack align="flex-start" spacing="0px" height="full" width={`${split.widthPct}%`}>
              <RefSeqView height="full" width={viewWidths[splitIndex]} />
              {splitIndex != splitGridContext.splits.length - 1 && (
                <GridDivider
                  height="full"
                  width={`${DIVIDER_PX}px`}
                  orientation={"vertical"}
                  index={splitIndex}
                />
              )}
            </HStack>
          </ErrorBoundary>
        );
      })}
    </Flex>
  );
};

export default RefSeqArea;
