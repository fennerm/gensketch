import { ReactElement, ReactNode, createContext, useContext, useEffect, useState } from "react";

import GenomicRegion from "../lib/GenomicRegion";
import { getAlignments, getDefaultReference, listen } from "../lib/backends/tauri";
import {
  BackendAlignmentStack,
  BackendAlignmentTrack,
  BackendGenomicRegion,
  BackendReferenceSequence,
  BackendSplit,
} from "../lib/events";
import logger from "../lib/logger";
import { deepCopy } from "../lib/util";
import { RefSeqContext } from "./RefSeqContext";

interface SplitGridContextInterface {
  reference: BackendReferenceSequence;
  splits: SplitState[];
  setSplitWidths: (widths: number[]) => void;
  tracks: TrackState[];
  setTrackHeights: (heights: number[]) => void;
}

export interface SplitState {
  id: string;
  widthPct: number;
  focusedRegion: GenomicRegion | null;
}

export interface TrackState {
  id: string;
  heightPct: number;
  name: string;
}

export interface TrackDataState {
  [trackId: string]: BackendAlignmentStack;
}

export const SplitGridContext = createContext<SplitGridContextInterface>(
  {} as SplitGridContextInterface
);

export const SplitGridContextProvider = ({
  children,
}: {
  children?: ReactNode;
}): ReactElement | null => {
  const [splits, setSplits] = useState<SplitState[]>([]);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [reference, setReference] = useState<BackendReferenceSequence | null>(null);
  const [trackData, setTrackData] = useState<TrackDataState>({});
  const refSeqContext = useContext(RefSeqContext);

  const addSplit = (newSplit: BackendSplit): void => {
    setSplits((splits) => {
      logger.debug(`Handling spit-added event: ${newSplit}`);
      const numSplits = splits.length;
      const newSplitWidth = 100 / (numSplits + 1);
      let updatedSplits = deepCopy(splits);
      updatedSplits.map((split) => {
        split.widthPct = split.widthPct - newSplitWidth / numSplits;
      });
      const newSplitState: SplitState = {
        id: newSplit.id,
        widthPct: newSplitWidth,
        focusedRegion: newSplit.focusedRegion
          ? GenomicRegion.fromBackendEvent(newSplit.focusedRegion)
          : null,
      };
      logger.debug(`Updating UI with new split: ${JSON.stringify(newSplitState)}`);
      updatedSplits.push(newSplitState);
      return updatedSplits;
    });
  };

  const addTrack = (newTrack: BackendAlignmentTrack): void => {
    logger.debug(`Handling track-added event: ${JSON.stringify(newTrack)}`);
    setTracks((tracks) => {
      const numTracks = tracks.length;
      const newTrackHeight = 100 / (numTracks + 1);
      let updatedTracks = deepCopy(tracks);
      updatedTracks.map((track) => {
        track.heightPct = track.heightPct - newTrackHeight / numTracks;
      });
      const newTrackState: TrackState = {
        ...newTrack,
        heightPct: newTrackHeight,
      };
      updatedTracks.push(newTrackState);
      logger.debug(`Updating UI with new track: ${JSON.stringify(newTrackState)}`);
      return updatedTracks;
    });

    // getAlignments({
    //   genomicRegion: refSeqContext.focusedRegion,
    //   trackId: newTrack.id,
    // }).then((alignments) => {
    //   setTrackData((trackDataState) => {
    //     trackDataState[newTrack.id] = alignments;
    //     return trackDataState;
    //   });
    // });
  };

  // const updateAlignments = (newRegion: GenomicRegion | BackendGenomicRegion) => {
  //   const trackIds = Object.keys(trackData);
  //   const promises = trackIds.map((trackId) =>
  //     getAlignments({ trackId, genomicRegion: newRegion })
  //   );
  //   Promise.all(promises).then((items) => {
  //     let newTrackDataState: { [key: string]: BackendAlignmentStack } = {};
  //     items.forEach((alignments, i) => {
  //       newTrackDataState[trackIds[i]] = alignments;
  //     });
  //   });
  // };

  useEffect(() => {
    const unlistenCallbacks = [
      listen("split-added", (event) => addSplit(event.payload as BackendSplit)),
      listen("track-added", (event) => addTrack(event.payload as BackendAlignmentTrack)),
      // listen("focused-region-updated", (event) =>
      //   updateAlignments(event.payload as BackendGenomicRegion)
      // ),
    ];
    getDefaultReference().then((result) => {
      setReference(result);
    });

    return () => {
      unlistenCallbacks.map((unlisten) => {
        unlisten.then((f) => f());
      });
    };
  }, []);

  const setSplitWidthsPct = (widths: number[]): void => {
    let updatedSplits = deepCopy(splits);
    updatedSplits.map((split, index) => {
      split.widthPct = widths[index];
    });
    setSplits(updatedSplits);
  };

  if (reference === null) {
    return null;
  }

  const setTrackHeightsPct = (heights: number[]): void => {
    let updatedTracks = deepCopy(tracks);
    updatedTracks.map((track, index) => {
      track.heightPct = heights[index];
    });
    setTracks(updatedTracks);
  };

  if (reference === null) {
    return null;
  }

  const value = {
    reference,
    splits,
    tracks,
    setSplitWidths: setSplitWidthsPct,
    setTrackHeights: setTrackHeightsPct,
  };
  return <SplitGridContext.Provider value={value}>{children}</SplitGridContext.Provider>;
};
