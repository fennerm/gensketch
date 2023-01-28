import { ReactElement, ReactNode, createContext, useContext, useEffect, useState } from "react";

import {
  AlignedPair,
  AlignmentStack,
  AlignmentTrackData,
  GenomicRegion,
  ReferenceSequenceData,
  SplitData,
} from "../bindings";
import { useBackendListener } from "../hooks";
import {
  getAlignments,
  getDefaultReference,
  listenForFocusedRegionUpdated,
  listenForSplitAdded,
  listenForTrackAdded,
} from "../lib/backend";
import LOG from "../lib/logger";
import { RefSeqContext } from "./RefSeqContext";

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

export type AlignmentsData = {
  [splitId: string]: AlignmentStack<AlignedPair>;
};

export interface AlignmentsDataState {
  [trackId: string]: AlignmentsData;
}

interface SplitContextInterface {
  splits: SplitState[];
}

interface SplitGridApiContextInterface {
  setSplitWidths: (widths: number[]) => void;
  setTrackHeights: (heights: number[]) => void;
}

interface TrackContextInterface {
  reference: ReferenceSequenceData;
  tracks: TrackState[];
}

interface AlignmentsContextInterface {
  alignments: AlignmentsDataState;
}

type AlignmentsResult = Promise<{
  splitId: string;
  trackId: string;
  alignments: AlignmentStack<AlignedPair>;
}>;

export const SplitContext = createContext<SplitContextInterface>({ splits: [] });

export const TrackContext = createContext<TrackContextInterface>({
  reference: {} as ReferenceSequenceData,
  tracks: [],
});

export const SplitGridApiContext = createContext<SplitGridApiContextInterface>(
  {} as SplitGridApiContextInterface
);

export const AlignmentsContext = createContext<AlignmentsContextInterface>(
  {} as AlignmentsContextInterface
);

export const SplitGridContextProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement | null => {
  const [splits, setSplits] = useState<SplitState[]>([]);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [reference, setReference] = useState<ReferenceSequenceData | null>(null);
  const [alignments, setAlignments] = useState<AlignmentsDataState>({});
  const refSeqContext = useContext(RefSeqContext);

  const getAllTrackIds = (): string[] => {
    return tracks.map((track) => track.id);
  };

  const getAllSplitIds = (): string[] => {
    return splits.map((split) => split.id);
  };

  const addSplit = (newSplit: SplitData): void => {
    setSplits((splits) => {
      LOG.debug(`Handling spit-added event: ${JSON.stringify(newSplit)}`);
      const numSplits = splits.length;
      const newSplitWidth = 100 / (numSplits + 1);
      splits.map((split) => {
        split.widthPct = split.widthPct - newSplitWidth / numSplits;
      });
      const newSplitState: SplitState = {
        id: newSplit.id,
        widthPct: newSplitWidth,
        focusedRegion: newSplit.focusedRegion,
      };
      LOG.debug(`Updating UI with new split: ${JSON.stringify(newSplitState)}`);
      splits.push(newSplitState);
      return [...splits];
    });
    updateAlignments({
      splitIds: [newSplit.id],
      trackIds: getAllTrackIds(),
      genomicRegion: newSplit.focusedRegion,
    });
  };

  const getAlignmentsResult = ({
    genomicRegion,
    splitId,
    trackId,
  }: {
    genomicRegion: GenomicRegion | GenomicRegion | null;
    splitId: string;
    trackId: string;
  }): AlignmentsResult => {
    return getAlignments({ genomicRegion, splitId, trackId }).then((alignments) => {
      LOG.debug(
        `Fetched ${alignments.rows.length} rows of alignments for track ${trackId} - split ${splitId}`
      );
      return {
        splitId,
        trackId,
        alignments,
      };
    });
  };

  const addTrack = (newTrack: AlignmentTrackData): void => {
    LOG.debug(`Handling track-added event: ${JSON.stringify(newTrack)}`);
    setTracks((tracks) => {
      LOG.debug("setTracks called...");
      const numTracks = tracks.length;
      const newTrackHeight = 100 / (numTracks + 1);
      tracks.map((track) => {
        track.heightPct = track.heightPct - newTrackHeight / numTracks;
      });
      const newTrackState: TrackState = {
        ...newTrack,
        heightPct: newTrackHeight,
      };
      tracks.push(newTrackState);
      LOG.debug(`Updating UI with new track: ${JSON.stringify(newTrackState)}`);
      return [...tracks];
    });

    updateAlignments({
      splitIds: getAllSplitIds(),
      trackIds: [newTrack.id],
      useExistingRegion: true,
    });
  };

  const updateAlignments = ({
    trackIds,
    splitIds,
    genomicRegion = null,
    useExistingRegion = false,
  }: {
    trackIds: readonly string[];
    splitIds: readonly string[];
    genomicRegion?: GenomicRegion | null;
    useExistingRegion?: boolean;
  }) => {
    const promises = trackIds.flatMap((trackId) => {
      return splitIds.map((splitId) => {
        if (useExistingRegion) {
          if ("splitId" in refSeqContext) {
            genomicRegion = refSeqContext[splitId].focusedRegion;
          } else {
            genomicRegion = null;
          }
        }
        return getAlignmentsResult({
          trackId,
          splitId: splitId,
          genomicRegion: genomicRegion,
        });
      });
    });

    Promise.all(promises).then((alignmentsResults) => {
      setAlignments((trackDataState) => {
        alignmentsResults.forEach(({ splitId, trackId, alignments }) => {
          if (!(trackId in trackDataState)) {
            trackDataState[trackId] = {};
          }
          trackDataState[trackId][splitId] = alignments;
        });
        return { ...trackDataState };
      });
    });
  };

  useBackendListener(listenForSplitAdded, (event) => addSplit(event.payload));
  useBackendListener(listenForTrackAdded, (event) => addTrack(event.payload));
  useBackendListener(listenForFocusedRegionUpdated, (event) => {
    updateAlignments({
      splitIds: [event.payload.splitId],
      trackIds: getAllTrackIds(),
      genomicRegion: event.payload.genomicRegion,
    });
  });

  useEffect(() => {
    getDefaultReference().then((result) => {
      setReference(result);
    });
  }, []);

  const setSplitWidthsPct = (widths: readonly number[]): void => {
    setSplits((splits) => {
      splits.map((split, index) => {
        split.widthPct = widths[index];
      });
      return [...splits];
    });
  };

  if (reference === null) {
    return null;
  }

  const setTrackHeightsPct = (heights: readonly number[]): void => {
    setTracks((tracks) => {
      tracks.map((track, index) => {
        track.heightPct = heights[index];
      });
      return [...tracks];
    });
  };

  if (reference === null) {
    return null;
  }

  const api = {
    setSplitWidths: setSplitWidthsPct,
    setTrackHeights: setTrackHeightsPct,
  };

  return (
    <TrackContext.Provider value={{ tracks, reference }}>
      <SplitContext.Provider value={{ splits }}>
        <AlignmentsContext.Provider value={{ alignments }}>
          <SplitGridApiContext.Provider value={api}>{children}</SplitGridApiContext.Provider>
        </AlignmentsContext.Provider>
      </SplitContext.Provider>
    </TrackContext.Provider>
  );
};
