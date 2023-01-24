import { Flex, Input } from "@chakra-ui/react";
import { KeyboardEvent, ReactElement, useState } from "react";

import { SplitState } from "../contexts/SplitGridContext";
import { updateFocusedRegion } from "../lib/backend";
import { getLength, parse1IndexedCoordinates, to1IndexedString } from "../lib/genomicCoordinates";
import LOG from "../lib/logger";

const MIN_FOCUSED_REGION = 20;

const SplitToolbar = ({ split }: { split: SplitState }): ReactElement => {
  const [inputRegion, setInputRegion] = useState<string>("");

  const handleFocusedRegionUpdate = (event: KeyboardEvent): void => {
    if (event.key == "Enter") {
      let genomicRegion;
      try {
        genomicRegion = parse1IndexedCoordinates(inputRegion);
        if (getLength(genomicRegion) < MIN_FOCUSED_REGION) {
          genomicRegion.start = genomicRegion.start - BigInt(MIN_FOCUSED_REGION) / 2n;
          if (genomicRegion.start < 0) {
            genomicRegion.start = 0n;
          }

          genomicRegion.end += genomicRegion.end + BigInt(MIN_FOCUSED_REGION) / 2n;
          // TODO handle case where end > csome length
        }
      } catch (error) {
        // TODO Display error in UI
        LOG.error(error);
        return;
      }
      updateFocusedRegion({ splitId: split.id, genomicRegion });
    }
  };

  const getDisplayedRegion = () => {
    let displayRegion = "";

    if (inputRegion !== "") {
      displayRegion = inputRegion;
    } else if (split.focusedRegion !== null) {
      displayRegion = to1IndexedString(split.focusedRegion);
    }
    return displayRegion;
  };

  return (
    <Flex className="split-toolbar" width={`${split.widthPct}%`}>
      <Input
        size="sm"
        width="300px"
        height="50px"
        value={getDisplayedRegion()}
        padding={0}
        onChange={(event) => setInputRegion(event.target.value)}
        onKeyUp={(event) => handleFocusedRegionUpdate(event)}
      ></Input>
    </Flex>
  );
};

export default SplitToolbar;
