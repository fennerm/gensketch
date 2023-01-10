import { Button, Flex, Input } from "@chakra-ui/react";
import { KeyboardEvent, ReactElement, useContext } from "react";

import { SplitGridContext } from "../contexts/SplitGridContext";
import GenomicRegion from "../lib/GenomicRegion";
import { addAlignmentTrack, addSplit, updateFocusedRegion } from "../lib/backends/tauri";
import SplitToolbar from "./SplitToolbar";

const Toolbar = ({ height, width }: { height: string; width: string }): ReactElement => {
  const splitGridContext = useContext(SplitGridContext);

  return (
    <Flex className="toolbar" height={height} width={width} flexDirection="column">
      <Flex width="full" height="full" flexDirection="row">
        <Button size="sm" onClick={() => addAlignmentTrack({ bamPath: "foo.bam" })}>
          Add Track
        </Button>
        <Button
          size="sm"
          onClick={() =>
            addSplit({
              referencePath: splitGridContext.reference.path,
              focusedRegion: new GenomicRegion({ seqName: "X", start: 0, end: 1000 }),
            })
          }
        >
          Add Split
        </Button>
      </Flex>
      <Flex width="full" height="full" flexDirection="row" alignItems="center">
        {splitGridContext.splits.map((split) => (
          <SplitToolbar split={split} key={split.id} />
        ))}
      </Flex>
    </Flex>
  );
};

export default Toolbar;
