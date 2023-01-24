import { invoke } from "@tauri-apps/api";
import { open } from "@tauri-apps/api/dialog";
import { EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { Event, listen } from "@tauri-apps/api/event";

import {
  AlertData,
  AlertStatusUpdateParams,
  AlignedPair,
  AlignmentStack,
  AlignmentTrackData,
  FocusedRegionUpdated,
  GenomicInterval,
  GenomicRegion,
  ReferenceSequenceData,
  SplitData,
  TrackData,
} from "../../bindings";

const convertCoordToBigInt = (region: GenomicRegion | GenomicInterval | null): void => {
  if (region === null) {
    return;
  }

  region.start = BigInt(region.start);
  region.end = BigInt(region.end);
};

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
  focusedRegion: GenomicRegion | GenomicRegion | null;
}): Promise<SplitData> => {
  return invoke("add_split", {
    referencePath,
    focusedRegion,
  }).then((splitData: any) => {
    convertCoordToBigInt(splitData.focusedRegion);
    return splitData;
  }) as Promise<SplitData>;
};

export const getAlignments = ({
  genomicRegion,
  splitId,
  trackId,
}: {
  genomicRegion: GenomicRegion | GenomicRegion | null;
  splitId: string;
  trackId: string;
}): Promise<AlignmentStack<AlignedPair>> => {
  return invoke("get_alignments", { genomicRegion, trackId, splitId }).then((alignments: any) => {
    alignments.rows.forEach((row: any[]) => {
      row.forEach((alignment: any) => {
        convertCoordToBigInt(alignment.interval);
        if (alignment.type == "pairedReadsKind") {
          if (alignment.read1 !== null) {
            convertCoordToBigInt(alignment.read1.region);
          }
          if (alignment.read2 !== null) {
            convertCoordToBigInt(alignment.read2.region);
          }
        } else {
          convertCoordToBigInt(alignment.read.region);
        }
      });
    });
    return alignments;
  }) as Promise<AlignmentStack<AlignedPair>>;
};

export const getDefaultReference = (): Promise<ReferenceSequenceData> => {
  return invoke("default_reference") as Promise<ReferenceSequenceData>;
};

export const getReferenceSequence = (genomicRegion: GenomicRegion): Promise<string> => {
  return invoke("get_reference_sequence", { genomicRegion }) as Promise<string>;
};

export const updateFocusedRegion = ({
  splitId,
  genomicRegion,
}: {
  splitId: string;
  genomicRegion: GenomicRegion | GenomicRegion;
}): Promise<SplitData> => {
  return invoke("update_focused_region", { splitId, genomicRegion }).then((splitData: any) => {
    convertCoordToBigInt(splitData.genomicRegion);
    return splitData;
  }) as Promise<SplitData>;
};

export const listenForSplitAdded = (callback: EventCallback<SplitData>): Promise<UnlistenFn> => {
  const wrappedCallback = (event: Event<SplitData>): void => {
    convertCoordToBigInt(event.payload.focusedRegion);
    callback(event);
  };
  return listen("split-added", wrappedCallback);
};

export const listenForFocusedRegionUpdated = (
  callback: EventCallback<FocusedRegionUpdated>
): Promise<UnlistenFn> => {
  const wrappedCallback = (event: Event<FocusedRegionUpdated>): void => {
    convertCoordToBigInt(event.payload.genomicRegion);
    callback(event);
  };
  return listen("focused-region-updated", wrappedCallback);
};

export const listenForTrackAdded = (
  callback: EventCallback<AlignmentTrackData>
): Promise<UnlistenFn> => {
  return listen("track-added", callback);
};

export const listenForNewAlert = (callback: EventCallback<AlertData>): Promise<UnlistenFn> => {
  return listen("new-alert", callback);
};

export const listenForAlertStatusUpdated = (
  callback: EventCallback<AlertStatusUpdateParams>
): Promise<UnlistenFn> => {
  return listen("new-status-updated", callback);
};

export const openFileDialog = async (): Promise<string[] | null> => {
  const selectedFiles = await open({ multiple: false });
  if (typeof selectedFiles === "string") {
    return [selectedFiles];
  }
  return selectedFiles;
};
