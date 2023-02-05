import { invoke } from "@tauri-apps/api";
import { open } from "@tauri-apps/api/dialog";
import { Event, listen } from "@tauri-apps/api/event";

import {
  AlertData,
  AlertStatusUpdateParams,
  AlignedPair,
  AlignedRead,
  AlignmentStack,
  AlignmentTrackData,
  FocusedRegionUpdated,
  GenomicInterval,
  GenomicRegion,
  ReferenceSequenceData,
  SplitData,
  UserConfig,
} from "../../bindings";
import { EventCallback, EventListener, UnlistenFn } from "../types";

const convertCoordToBigInt = (region: GenomicRegion | GenomicInterval | null): void => {
  if (region === null) {
    return;
  }

  region.start = BigInt(region.start);
  region.end = BigInt(region.end);
};

export const convertReadCoordToBigInt = (read: AlignedRead | null): void => {
  if (read === null) {
    return;
  }
  convertCoordToBigInt(read.region);
  read.diffs.forEach((diff) => {
    convertCoordToBigInt(diff.interval);
  });
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
  readonly focusedRegion: GenomicRegion | GenomicRegion | null;
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
  readonly genomicRegion: Readonly<GenomicRegion | GenomicRegion | null>;
  splitId: string;
  trackId: string;
}): Promise<AlignmentStack<AlignedPair>> => {
  return invoke("get_alignments", { genomicRegion, trackId, splitId }).then((alignments: any) => {
    alignments.rows.forEach((row: any[]) => {
      row.forEach((alignment: any) => {
        convertCoordToBigInt(alignment.interval);
        let reads: AlignedRead[];
        if (alignment.type == "pairedReadsKind") {
          reads = [alignment.read1, alignment.read2];
        } else {
          reads = alignment.read;
          convertCoordToBigInt(alignment.read.region);
        }
        reads.forEach((read) => {
          convertReadCoordToBigInt(read);
        });
      });
    });
    return alignments;
  }) as Promise<AlignmentStack<AlignedPair>>;
};

export const getDefaultReference = (): Promise<ReferenceSequenceData> => {
  return invoke("default_reference") as Promise<ReferenceSequenceData>;
};

export const getReferenceSequence = (genomicRegion: Readonly<GenomicRegion>): Promise<string> => {
  return invoke("get_reference_sequence", { genomicRegion }) as Promise<string>;
};

export const updateFocusedRegion = ({
  splitId,
  genomicRegion,
}: {
  splitId: string;
  readonly genomicRegion: GenomicRegion | GenomicRegion;
}): Promise<SplitData> => {
  return invoke("update_focused_region", { splitId, genomicRegion }).then((splitData: any) => {
    convertCoordToBigInt(splitData.genomicRegion);
    return splitData;
  }) as Promise<SplitData>;
};

export const getUserConfig = (): Promise<UserConfig> => {
  return invoke("get_user_config", {}) as Promise<UserConfig>;
};

export const listenForSplitAdded: EventListener<SplitData> = (callback) => {
  const wrappedCallback = (event: Event<SplitData>): void => {
    convertCoordToBigInt(event.payload.focusedRegion);
    callback(event);
  };
  return listen("split-added", wrappedCallback);
};

export const listenForFocusedRegionUpdated: EventListener<FocusedRegionUpdated> = (callback) => {
  const wrappedCallback = (event: Event<FocusedRegionUpdated>): void => {
    convertCoordToBigInt(event.payload.genomicRegion);
    callback(event);
  };
  return listen("focused-region-updated", wrappedCallback);
};

export const listenForTrackAdded: EventListener<AlignmentTrackData> = (callback) => {
  return listen("track-added", callback);
};

export const listenForNewAlert: EventListener<AlertData> = (callback) => {
  return listen("new-alert", callback);
};

export const listenForAlertStatusUpdated: EventListener<AlertStatusUpdateParams> = (callback) => {
  return listen("new-status-updated", callback);
};

export const listenForUserConfigUpdated: EventListener<UserConfig> = (callback) => {
  return listen("user-config-updated", callback);
};

export const openFileDialog = async (): Promise<string[] | null> => {
  const selectedFiles = await open({ multiple: false });
  if (typeof selectedFiles === "string") {
    return [selectedFiles];
  }
  return selectedFiles;
};
