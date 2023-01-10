import { Flex, Input } from "@chakra-ui/react";
import { KeyboardEvent, ReactElement, useContext, useState } from "react";

import { RefSeqContext } from "../contexts/RefSeqContext";
import { SplitState } from "../contexts/SplitGridContext";
import GenomicRegion from "../lib/GenomicRegion";
import { updateFocusedRegion } from "../lib/backends/tauri";
import LOG from "../lib/logger";

const MIN_FOCUSED_REGION = 20;

const SplitToolbar = ({ split }: { split: SplitState }): ReactElement => {
  const refSeqContext = useContext(RefSeqContext);
  const [inputRegion, setInputRegion] = useState<string>(
    refSeqContext.focusedRegion.to1IndexedString()
  );

  const handleFocusedRegionUpdate = (event: KeyboardEvent): void => {
    if (event.key == "Enter") {
      let genomicRegion;
      try {
        genomicRegion = GenomicRegion.from1IndexedString(inputRegion);
        if (genomicRegion.length() < MIN_FOCUSED_REGION) {
          genomicRegion.start = genomicRegion.start - MIN_FOCUSED_REGION / 2;
          if (genomicRegion.start < 0) {
            genomicRegion.start = 0;
          }

          genomicRegion.end += genomicRegion.end + MIN_FOCUSED_REGION / 2;
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

  return (
    <Flex className="split-toolbar" width={`${split.widthPct}%`}>
      <Input
        size="sm"
        width="300px"
        height="50px"
        value={inputRegion}
        padding={0}
        onChange={(event) => setInputRegion(event.target.value)}
        onKeyUp={(event) => handleFocusedRegionUpdate(event)}
      ></Input>
    </Flex>
  );
};

export default SplitToolbar;
