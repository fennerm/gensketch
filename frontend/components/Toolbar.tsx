import { Button, Flex } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { GenomicRegion } from "../bindings";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { SplitContext, TrackContext } from "../contexts/SplitGridContext";
import { addAlignmentTrack, addSplit, openFileDialog } from "../lib/backend";
import SplitToolbar from "./SplitToolbar";

const Toolbar = ({ height, width }: { height: string; width: string }): ReactElement => {
  const trackContext = useContext(TrackContext);
  const splitContext = useContext(SplitContext);
  const refSeqContext = useContext(RefSeqContext);

  const newTrack = () => {
    openFileDialog().then((fileNames) => {
      if (fileNames === null) {
        return;
      }
      fileNames.map((fileName) => addAlignmentTrack({ bamPath: fileName }));
    });
  };

  const newSplit = (): void => {
    let focusedRegion: GenomicRegion | null = null;
    if (splitContext.splits.length > 0) {
      const lastSplitId = splitContext.splits[splitContext.splits.length - 1].id;
      focusedRegion = refSeqContext[lastSplitId].focusedRegion;
    }
    addSplit({
      referencePath: trackContext.reference.path,
      focusedRegion,
    });
  };

  return (
    <Flex className="toolbar" height={height} width={width} flexDirection="column">
      <Flex width="full" height="full" flexDirection="row">
        <Button size="sm" onClick={() => newTrack()}>
          Add Track
        </Button>
        <Button size="sm" onClick={() => newSplit()}>
          Add Split
        </Button>
      </Flex>
      <Flex width="full" height="full" flexDirection="row" alignItems="center">
        {splitContext.splits.map((split) => (
          <SplitToolbar split={split} key={split.id} />
        ))}
      </Flex>
    </Flex>
  );
};

export default Toolbar;
