import { Event } from "@tauri-apps/api/event";
import { ReactElement, ReactNode, createContext, useContext, useState } from "react";

import { FocusedRegionUpdated, GenomicRegion, SplitData } from "../bindings";
import {
  getReferenceSequence,
  listenForFocusedRegionUpdated,
  listenForSplitAdded,
} from "../lib/backend";
import { useBackendListener } from "../lib/hooks";
import LOG from "../lib/logger";
import { AlertApiContext } from "./AlertContext";

interface RefSeqContextInterface {
  [splitId: string]: {
    sequence: string;
    focusedRegion: GenomicRegion | null;
  };
}

interface RefSeqApiContextInterface {
  updateFocusedRegion: ({
    splitId,
    newFocusedRegion,
  }: {
    splitId: string;
    newFocusedRegion: GenomicRegion | null;
  }) => void;
}

export const RefSeqContext = createContext<RefSeqContextInterface>(
  {} as RefSeqContextInterface // Safe cast because it will always be set in the provider
);
export const RefSeqApiContext = createContext<RefSeqApiContextInterface>(
  {} as RefSeqApiContextInterface // Safe cast because it will always be set in the provider
);

export const RefSeqContextProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const [splitData, setSplitData] = useState<RefSeqContextInterface | null>(null);
  const alertApi = useContext(AlertApiContext);

  const getReferenceSequenceSafe = (genomicRegion: GenomicRegion | null): Promise<string> => {
    if (genomicRegion !== null) {
      return getReferenceSequence(genomicRegion);
    } else {
      return new Promise((resolve) => "");
    }
  };

  const addSplit = (event: SplitData): void => {
    LOG.debug(`Handling split-added event ${JSON.stringify(event)}`);
    setSplitData((splitData) => {
      let focusedRegion = null;
      let sequence = "";
      const splitIds = Object.keys(splitData);

      if (splitIds.length > 0) {
        const lastSplit = splitData[splitIds[splitIds.length - 1]];
        focusedRegion = lastSplit.focusedRegion;
        sequence = lastSplit.sequence;
      }
      splitData[event.id] = {
        sequence,
        focusedRegion,
      };
      return { ...splitData };
    });
  };

  const updateFocusedRegion = ({
    splitId,
    newFocusedRegion,
  }: {
    splitId: string;
    newFocusedRegion: GenomicRegion | null;
  }): void => {
    getReferenceSequenceSafe(newFocusedRegion)
      .then((sequence) => {
        setSplitData((splitData) => {
          splitData[splitId] = { sequence, focusedRegion: newFocusedRegion };
          LOG.debug(`Updated focused region to ${JSON.stringify(newFocusedRegion)}`);
          return { ...splitData };
        });
      })
      .catch((error) => {
        alertApi.addAlert({ message: error, status: "error" });
        LOG.error(error);
      });
  };

  const handleFocusChange = (event: FocusedRegionUpdated): void => {
    LOG.debug(`Handling focused-region-updated event ${JSON.stringify(event)}`);
    updateFocusedRegion({ splitId: event.splitId, newFocusedRegion: event.genomicRegion });
  };

  useBackendListener(listenForSplitAdded, (event) => addSplit(event.payload));
  useBackendListener(listenForFocusedRegionUpdated, (event: Event<FocusedRegionUpdated>) => {
    handleFocusChange(event.payload);
  });

  return (
    <RefSeqContext.Provider value={splitData}>
      <RefSeqApiContext.Provider value={{ updateFocusedRegion }}>
        {children}
      </RefSeqApiContext.Provider>
    </RefSeqContext.Provider>
  );
};
