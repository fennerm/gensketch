import { invoke } from "@tauri-apps/api";

import {
  AlignedPairData,
  AlignmentStackData,
  AlignmentTrackData,
  GenomicRegionData,
  ReferenceSequenceData,
  SplitData,
} from "../../bindings";
import GenomicRegion from "../GenomicRegion";

export const addAlignmentTrack = ({
  bamPath,
}: {
  bamPath: string;
}): Promise<AlignmentTrackData> => {
  return invoke("add_alignment_track", {
    bamPath,
  }) as Promise<AlignmentTrackData>;
};

export const addSplit = ({
  referencePath,
  focusedRegion,
}: {
  referencePath: string;
  focusedRegion: GenomicRegion | GenomicRegionData;
}): Promise<SplitData> => {
  return invoke("add_split", {
    referencePath,
    focusedRegion,
  }) as Promise<SplitData>;
};

export const getAlignments = ({
  genomicRegion,
  trackId,
}: {
  genomicRegion: GenomicRegion | GenomicRegionData;
  trackId: string;
}): Promise<AlignmentStackData<AlignedPairData>> => {
  return invoke("get_alignments", { genomicRegion, trackId }) as Promise<
    AlignmentStackData<AlignedPairData>
  >;
};

export const getDefaultReference = (): Promise<ReferenceSequenceData> => {
  return invoke("default_reference") as Promise<ReferenceSequenceData>;
};

export const getReferenceSequence = (
  genomicRegion: GenomicRegion | GenomicRegionData
): Promise<string> => {
  return invoke("get_reference_sequence", { genomicRegion }) as Promise<string>;
};

export const updateFocusedRegion = ({
  splitId,
  genomicRegion,
}: {
  splitId: string;
  genomicRegion: GenomicRegion | GenomicRegionData;
}): Promise<SplitData> => {
  return invoke("update_focused_region", { splitId, genomicRegion });
};

// For now just re-exporting tauri's listen func but eventually we'll want to wrap this in a more
// generic way if we implement a JS backend.
export { listen } from "@tauri-apps/api/event";
