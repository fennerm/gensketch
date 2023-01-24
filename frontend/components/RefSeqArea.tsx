import { Flex, HStack } from "@chakra-ui/react";
import { ReactElement, useContext, useEffect, useRef, useState } from "react";

import { SplitContext } from "../contexts/SplitGridContext";
import { DIVIDER_PX } from "../lib/constants";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";
import RefSeqView from "./RefSeqView";

/**
 * Area of the UI where the reference sequence is rendered.
 *
 * Rendering of the refseq is handled in the child RefSeqView components (one for each split).
 */
const RefSeqArea = ({ height, width }: { height: string; width: string }): ReactElement => {
  const splitContext = useContext(SplitContext);
  const ref = useRef<HTMLDivElement>(null);

  // Width "full" doesn't seem to be working well here for some reason. Perhaps due to some
  // interaction with the canvas element in RefSeqView?
  const calcViewWidth = (splitIndex: number, splitWidth: number): number => {
    if (ref.current === null) {
      return 0;
    }
    let dividerWidth = DIVIDER_PX;
    if (splitIndex == splitContext.splits.length - 1) {
      dividerWidth = 0;
    }
    return (splitWidth / 100) * window.innerWidth - dividerWidth;
  };

  const viewWidths = Array.from(
    splitContext.splits.map((split, index) => calcViewWidth(index, split.widthPct)).values()
  );

  return (
    <Flex className="ref-seq-area" ref={ref} height={height} width={width}>
      {splitContext.splits.map((split, splitIndex: number) => {
        return (
          <ErrorBoundary key={splitIndex}>
            <HStack align="flex-start" spacing="0px" height="full" width={`${split.widthPct}%`}>
              <RefSeqView height="full" width={viewWidths[splitIndex]} splitId={split.id} />
              {splitIndex != splitContext.splits.length - 1 && (
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
