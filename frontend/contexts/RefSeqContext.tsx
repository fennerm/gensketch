import { ReactElement, ReactNode, createContext, useEffect, useState } from "react";

import { GenomicRegionData } from "../bindings";
import GenomicRegion from "../lib/GenomicRegion";
import { getReferenceSequence, listen } from "../lib/backends/tauri";

interface RefSeqContextInterface {
  sequence: string;
  focusedRegion: GenomicRegion;
}

export const RefSeqContext = createContext<RefSeqContextInterface>({} as RefSeqContextInterface);

export const RefSeqContextProvider = ({ children }: { children?: ReactNode }): ReactElement => {
  const [focusedRegion, setFocusedRegion] = useState<GenomicRegion>(
    new GenomicRegion({ seqName: "1", start: 50000, end: 50230 })
  );
  const [sequence, setSequence] = useState<string>("");

  const updateReferenceSequence = (genomicRegion: GenomicRegion): void => {
    if (genomicRegion.length() < 1000) {
      getReferenceSequence(genomicRegion).then((sequence) => {
        setSequence(sequence);
      });
    } else {
      setSequence("");
    }
  };

  const handleFocusChange = (genomicRegion: GenomicRegionData): void => {
    const region = GenomicRegion.fromBackendEvent(genomicRegion);
    setFocusedRegion(region);
    updateReferenceSequence(region);
  };

  useEffect(() => {
    updateReferenceSequence(focusedRegion);

    const unlistenCallbacks = [
      listen("focused-region-updated", (event) => {
        handleFocusChange(event.payload as GenomicRegionData);
      }),
    ];

    return () => {
      unlistenCallbacks.map((unlisten) => {
        unlisten.then((f) => f());
      });
    };
  }, []);

  const value = {
    sequence,
    focusedRegion,
  };
  return <RefSeqContext.Provider value={value}>{children}</RefSeqContext.Provider>;
};
