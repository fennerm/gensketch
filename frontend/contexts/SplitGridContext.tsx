import {
  ReactElement,
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlignedPair,
  AlignmentStack,
  AlignmentTrackData,
  GenomicRegion,
  ReferenceSequenceData,
  SplitData,
} from "../bindings";
import {
  getAlignments,
  getDefaultReference,
  listenForFocusedRegionUpdated,
  listenForSplitAdded,
  listenForTrackAdded,
} from "../lib/backend";
import { useBackendListener } from "../lib/hooks";
import LOG from "../lib/logger";
import { AlertApiContext } from "./AlertContext";

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

interface FocusedRegionState {
  [splitId: string]: GenomicRegion | null;
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
} | null>;

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
  const alertApi = useContext(AlertApiContext);
  const allTrackIds = useRef<string[]>([]);
  const allSplitIds = useRef<string[]>([]);
  const focusedRegions = useRef<FocusedRegionState>({});

  const addSplit = (newSplit: SplitData): void => {
    setSplits((state) => {
      LOG.debug(`Handling spit-added event: ${JSON.stringify(newSplit)}`);
      const numSplits = state.length;
      const newSplitWidth = 100 / (numSplits + 1);
      state.map((split) => {
        split.widthPct = split.widthPct - newSplitWidth / numSplits;
      });
      const newSplitState: SplitState = {
        id: newSplit.id,
        widthPct: newSplitWidth,
        focusedRegion: newSplit.focusedRegion,
      };
      LOG.debug(`Updating UI with new split: ${JSON.stringify(newSplitState)}`);
      state.push(newSplitState);
      allSplitIds.current.push(newSplitState.id);
      focusedRegions.current[newSplitState.id] = newSplitState.focusedRegion;
      return [...state];
    });
    updateAlignments({
      splitIds: [newSplit.id],
      trackIds: allTrackIds.current,
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
    return getAlignments({ genomicRegion, splitId, trackId })
      .then((alignments) => {
        LOG.debug(
          `Fetched ${alignments.rows.length} rows of alignments for track ${trackId} - split ${splitId}`
        );
        return {
          splitId,
          trackId,
          alignments,
        };
      })
      .catch((error) => {
        alertApi.addAlert({ message: error, status: "error" });
        LOG.error(error);
        return null;
      });
  };

  const addTrack = (newTrack: AlignmentTrackData): void => {
    LOG.debug(`Handling track-added event: ${JSON.stringify(newTrack)}`);
    setTracks((state) => {
      LOG.debug("setTracks called...");
      const numTracks = state.length;
      const newTrackHeight = 100 / (numTracks + 1);
      state.map((track) => {
        track.heightPct = track.heightPct - newTrackHeight / numTracks;
      });
      const newTrackState: TrackState = {
        ...newTrack,
        heightPct: newTrackHeight,
      };
      state.push(newTrackState);
      allTrackIds.current.push(newTrackState.id);
      LOG.debug(`Updating UI with new track: ${JSON.stringify(newTrackState)}`);
      return [...state];
    });
    updateAlignments({
      splitIds: allSplitIds.current,
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
          if (focusedRegions.current[splitId] !== undefined) {
            genomicRegion = focusedRegions.current[splitId];
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
        alignmentsResults.forEach((result) => {
          if (result === null) {
            return;
          }
          const { splitId, trackId, alignments } = result;
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
    focusedRegions.current[event.payload.splitId] = event.payload.genomicRegion;
    updateAlignments({
      splitIds: [event.payload.splitId],
      trackIds: allTrackIds.current,
      genomicRegion: event.payload.genomicRegion,
    });
  });

  useEffect(() => {
    getDefaultReference()
      .then((result) => {
        setReference(result);
      })
      .catch((error) => {
        alertApi.addAlert({ message: error, status: "error" });
        LOG.error(error);
      });
  }, []);

  const setSplitWidthsPct = (widths: readonly number[]): void => {
    setSplits((state) => {
      state.map((split, index) => {
        split.widthPct = widths[index];
      });
      return [...state];
    });
  };

  if (reference === null) {
    return null;
  }

  const setTrackHeightsPct = (heights: readonly number[]): void => {
    setTracks((state) => {
      state.map((track, index) => {
        track.heightPct = heights[index];
      });
      return [...state];
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
