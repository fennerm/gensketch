import { invoke } from "@tauri-apps/api";
import { listen as tauriListen } from "@tauri-apps/api/event";

import GenomicRegion from "../GenomicRegion";
import {
  BackendAlignmentStack,
  BackendAlignmentTrack,
  BackendGenomicRegion,
  BackendReferenceSequence,
  BackendSplit,
} from "../events";

export const addAlignmentTrack = ({
  bamPath,
}: {
  bamPath: string;
}): Promise<BackendAlignmentTrack> => {
  return invoke("add_alignment_track", {
    bamPath,
  }) as Promise<BackendAlignmentTrack>;
};

export const addSplit = ({
  referencePath,
  focusedRegion,
}: {
  referencePath: string;
  focusedRegion: GenomicRegion | BackendGenomicRegion;
}): Promise<BackendSplit> => {
  return invoke("add_split", {
    referencePath,
    focusedRegion,
  }) as Promise<BackendSplit>;
};

export const getAlignments = ({
  genomicRegion,
  trackId,
}: {
  genomicRegion: GenomicRegion | BackendGenomicRegion;
  trackId: string;
}): Promise<BackendAlignmentStack> => {
  return invoke("get_alignments", { genomicRegion, trackId }) as Promise<BackendAlignmentStack>;
};

export const getDefaultReference = (): Promise<BackendReferenceSequence> => {
  return invoke("default_reference") as Promise<BackendReferenceSequence>;
};

export const getReferenceSequence = (
  genomicRegion: GenomicRegion | BackendGenomicRegion
): Promise<string> => {
  return invoke("get_reference_sequence", { genomicRegion }) as Promise<string>;
};

export const updateFocusedRegion = ({
  splitId,
  genomicRegion,
}: {
  splitId: string;
  genomicRegion: GenomicRegion | BackendGenomicRegion;
}): Promise<BackendSplit> => {
  return invoke("update_focused_region", { splitId, genomicRegion });
};

// For now just re-exporting tauri's listen func but eventually we'll want to wrap this in a more
// generic way if we implement a JS backend.
export { listen } from "@tauri-apps/api/event";
