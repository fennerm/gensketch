import type {
  AlertData,
  AlertStatusUpdateParams,
  AlignedPair,
  AlignedRead,
  AlignmentStackKind,
  AlignmentTrackData,
  AlignmentsUpdatedPayload,
  FocusedRegionUpdatedPayload,
  FocusedSequenceUpdatedPayload,
  GenomicInterval,
  GenomicRegion,
  ReferenceSequence,
  SplitData,
  UserConfig,
} from "@lib/bindings";
import type { EventListener } from "@lib/types";
import { invoke } from "@tauri-apps/api";
import { open } from "@tauri-apps/api/dialog";
import type { Event } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";

const convertCoordToBigInt = (interval: GenomicInterval | null | undefined): void => {
  if (interval === null || interval === undefined) {
    return;
  }

  interval.start = BigInt(interval.start);
  interval.end = BigInt(interval.end);
};

const convertReadCoordToBigInt = (read: AlignedRead | null): void => {
  if (read === null) {
    return;
  }
  convertCoordToBigInt(read.region.interval);
  read.diffs.forEach((diff) => {
    convertCoordToBigInt(diff.interval);
  });
};

const convertAlignedPairCoordToBigInt = (alignedPair: AlignedPair): void => {
  convertCoordToBigInt(alignedPair.interval);
  switch (alignedPair.type) {
    case "pairedReadsKind":
      convertReadCoordToBigInt(alignedPair.read1);
      convertReadCoordToBigInt(alignedPair.read2);
      break;
    case "discordantReadKind":
    case "unpairedReadKind":
      convertReadCoordToBigInt(alignedPair.read);
      break;
  }
};

const convertAlignmentStackToBigInt = (alignments: AlignmentStackKind): void => {
  alignments.rows.forEach((row) => {
    row.forEach((alignment) => {
      convertAlignedPairCoordToBigInt(alignment);
    });
  });
};

export const addAlignmentTrack = ({ bamPath }: { bamPath: string }): Promise<null> => {
  return invoke("add_alignment_track", {
    bamPath,
  }) as Promise<null>;
};

export const addSplit = ({
  focusedRegion,
}: {
  readonly focusedRegion: GenomicRegion | GenomicRegion | null;
}): Promise<null> => {
  return invoke("add_split", {
    focusedRegion,
  }) as Promise<null>;
};

export const getUserConfig = (): Promise<UserConfig> => {
  return invoke("get_user_config") as Promise<UserConfig>;
};

export const getFocusedSequence = (splitId: string): Promise<string | null> => {
  return invoke("get_focused_sequence", { splitId }) as Promise<string | null>;
};

export const getFocusedRegion = (splitId: string): Promise<GenomicRegion> => {
  return (invoke("get_focused_region", { splitId }) as Promise<GenomicRegion>).then(
    (genomicRegion) => {
      convertCoordToBigInt(genomicRegion.interval);
      return genomicRegion;
    }
  );
};

export const getReferenceSequence = (): Promise<ReferenceSequence> => {
  return invoke("get_reference_sequence") as Promise<ReferenceSequence>;
};

export const getAlignments = ({
  trackId,
  splitId,
}: {
  trackId: string;
  splitId: string;
}): Promise<AlignmentStackKind> => {
  return (invoke("get_alignments", { trackId, splitId }) as Promise<AlignmentStackKind>).then(
    (alignments) => {
      convertAlignmentStackToBigInt(alignments);
      return alignments;
    }
  );
};

export const initializeBackend = (): Promise<null> => {
  return invoke("initialize");
};

export const updateFocusedRegion = ({
  splitId,
  genomicRegion,
}: {
  splitId: string;
  readonly genomicRegion: GenomicRegion | GenomicRegion;
}): Promise<null> => {
  return invoke("update_focused_region", { splitId, genomicRegion });
};

export const listenForSplitAdded: EventListener<SplitData> = (callback) => {
  const wrappedCallback = (event: Event<SplitData>): void => {
    convertCoordToBigInt(event.payload.focusedRegion?.interval);
    callback(event);
  };
  return listen("split-added", wrappedCallback);
};

export const listenForFocusedRegionUpdated: EventListener<FocusedRegionUpdatedPayload> = (
  callback
) => {
  const wrappedCallback = (event: Event<FocusedRegionUpdatedPayload>): void => {
    convertCoordToBigInt(event.payload.genomicRegion?.interval);
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

export const listenForFocusedSequenceUpdated: EventListener<FocusedSequenceUpdatedPayload> = (
  callback
) => {
  return listen("focused-sequence-updated", callback);
};

type AlignmentsUpdatedCallback = (event: Event<AlignmentsUpdatedPayload>) => void;

const wrapAlignmentsUpdateCallback = (
  callback: AlignmentsUpdatedCallback
): AlignmentsUpdatedCallback => {
  const wrappedCallback = (event: Event<AlignmentsUpdatedPayload>): void => {
    convertCoordToBigInt(event.payload.focusedRegion.interval);
    convertAlignmentStackToBigInt(event.payload.alignments);
    callback(event);
  };
  return wrappedCallback;
};

export const listenForAlignmentsUpdated: EventListener<AlignmentsUpdatedPayload> = (callback) => {
  const wrappedCallback = wrapAlignmentsUpdateCallback(callback);
  return listen("alignments-updated", wrappedCallback);
};

export const listenForAlignmentsUpdateQueued: EventListener<AlignmentsUpdatedPayload> = (
  callback
) => {
  const wrappedCallback = wrapAlignmentsUpdateCallback(callback);
  return listen("alignments-update-queued", wrappedCallback);
};

export const listenForRefSeqFileUpdated: EventListener<ReferenceSequence> = (callback) => {
  const wrappedCallback = (event: Event<ReferenceSequence>): void => {
    for (const [seqName, seqLength] of Object.entries(event.payload.seqLengths)) {
      event.payload.seqLengths[seqName] = BigInt(seqLength);
    }
    callback(event);
  };
  return listen("ref-seq-file-updated", wrappedCallback);
};

export const openFileDialog = async (): Promise<string[] | null> => {
  const selectedFiles = await open({ multiple: false });
  if (typeof selectedFiles === "string") {
    return [selectedFiles];
  }
  return selectedFiles;
};
