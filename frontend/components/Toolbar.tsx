import { Button, Flex } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { GenomicRegion } from "../bindings";
import { AlertApiContext } from "../contexts/AlertContext";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { SplitContext, TrackContext } from "../contexts/SplitGridContext";
import { addAlignmentTrack, addSplit, openFileDialog } from "../lib/backend";
import LOG from "../lib/logger";
import { Size } from "../lib/types";
import SplitToolbar from "./SplitToolbar";

const Toolbar = ({ height, width }: { height: Size; width: Size }): ReactElement => {
  const trackContext = useContext(TrackContext);
  const splitContext = useContext(SplitContext);
  const refSeqContext = useContext(RefSeqContext);
  const alertApi = useContext(AlertApiContext);

  const newTrack = () => {
    openFileDialog()
      .then((fileNames) => {
        if (fileNames === null) {
          return;
        }
        fileNames.map((fileName) =>
          addAlignmentTrack({ bamPath: fileName }).catch((error) => {
            alertApi.addAlert({ message: error, status: "error" });
            LOG.error(error);
          })
        );
      })
      .catch((error) => {
        alertApi.addAlert({ message: "Failed to open file picker dialog", status: "error" });
        LOG.error(error);
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
    }).catch((error) => {
      alertApi.addAlert({ message: error, status: "error" });
      LOG.error(error);
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
