import { Event } from "@tauri-apps/api/event";
import { ReactElement, ReactNode, createContext, useEffect, useState } from "react";

import { FocusedRegionUpdated, GenomicRegion, SplitData } from "../bindings";
import {
  getReferenceSequence,
  listenForFocusedRegionUpdated,
  listenForSplitAdded,
} from "../lib/backend";
import { getLength } from "../lib/genomicCoordinates";
import LOG from "../lib/logger";

interface RefSeqContextInterface {
  [splitId: string]: {
    sequence: string;
    focusedRegion: GenomicRegion | null;
  };
}

export const RefSeqContext = createContext<RefSeqContextInterface>({} as RefSeqContextInterface);

export const RefSeqContextProvider = ({ children }: { children?: ReactNode }): ReactElement => {
  const [splitData, setSplitData] = useState<RefSeqContextInterface>({});

  const getReferenceSequenceSafe = (genomicRegion: GenomicRegion | null): Promise<string> => {
    if (genomicRegion !== null && getLength(genomicRegion) < 1000) {
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

  const handleFocusChange = (event: FocusedRegionUpdated): void => {
    LOG.debug(`Handling focused-region-updated event ${JSON.stringify(event)}`);
    getReferenceSequenceSafe(event.genomicRegion)
      .then((sequence) => {
        setSplitData((splitData) => {
          splitData[event.splitId] = { sequence, focusedRegion: event.genomicRegion };
          LOG.debug(`Updated focused region to ${JSON.stringify(event.genomicRegion)}`);
          return { ...splitData };
        });
      })
      .catch((error) => {
        LOG.error(error);
      });
  };

  useEffect(() => {
    const unlistenCallbacks = [
      listenForSplitAdded((event) => addSplit(event.payload)),
      listenForFocusedRegionUpdated((event: Event<FocusedRegionUpdated>) =>
        handleFocusChange(event.payload)
      ),
    ];

    return () => {
      unlistenCallbacks.map((unlisten) => {
        unlisten.then((f) => f());
      });
    };
  }, []);

  return <RefSeqContext.Provider value={splitData}>{children}</RefSeqContext.Provider>;
};
