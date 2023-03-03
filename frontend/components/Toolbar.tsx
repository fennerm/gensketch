import { Button, Flex } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { AlertApiContext } from "../contexts/AlertContext";
import { addAlignmentTrack, addSplit, openFileDialog } from "../lib/backend";
import LOG from "../lib/logger";
import { Size } from "../lib/types";

const Toolbar = ({ height, width }: { height: Size; width: Size }): ReactElement => {
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
    addSplit({
      focusedRegion: null,
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
    </Flex>
  );
};

export default Toolbar;
