import type {
  AlertData,
  AlertStatusUpdateParams,
  AlignmentStackKind,
  AlignmentTrackData,
  AlignmentsUpdatedPayload,
  FocusedRegionUpdatedPayload,
  FocusedSequenceUpdatedPayload,
  GenomicRegion,
  ReferenceSequence,
  RegionBufferingPayload,
  SplitData,
  SplitMap,
  UserConfig,
} from "@lib/bindings";
import type { EventListener } from "@lib/types";
import { invoke } from "@tauri-apps/api";
import { open } from "@tauri-apps/api/dialog";
import type { Event, EventCallback, EventName, UnlistenFn } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import type { InvokeArgs } from "@tauri-apps/api/tauri";

/**
 * Iterates through every key/value pair in an object and converts any strings which are valid ints
 * to BigInts.
 *
 * @param obj - The object to be updated.
 */
const convertBigInts = (obj: any): void => {
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) {
      continue;
    }
    if (typeof obj[key] === "string" && !isNaN(obj[key])) {
      obj[key] = BigInt(obj[key]);
    } else if (typeof obj[key] === "object") {
      convertBigInts(obj[key]);
    }
  }
};

/**
 * Run a Tauri command and do some post-processing on the response.
 * @param cmd - The command name to run.
 * @param args - Arguments to pass to the command
 * @returns A promise containing the response.
 */
const runCommand = <T>(cmd: string, args?: InvokeArgs): Promise<T> => {
  return invoke<T>(cmd, args).then((response) => {
    convertBigInts(response);
    return response;
  });
};

/**
 * Listen for a tauri event and do some processing on the event before returning.
 * @param event - The event name to listen for.
 * @param handler - The handler to call when the event is received.
 * @returns A promise containing the unlisten function.
 */
const tauriListen = <T>(event: EventName, handler: EventCallback<T>): Promise<UnlistenFn> => {
  const wrappedHandler = (event: Event<T>): void => {
    convertBigInts(event);
    return handler(event);
  };
  return listen(event, wrappedHandler);
};

export const addAlignmentTrack = ({ filePath }: { filePath: string }): Promise<null> => {
  return runCommand<null>("add_alignment_track", {
    filePath,
  });
};

export const addSplit = ({
  focusedRegion,
}: {
  readonly focusedRegion: GenomicRegion | GenomicRegion | null;
}): Promise<null> => {
  return runCommand<null>("add_split", {
    focusedRegion,
  });
};

export const getUserConfig = (): Promise<UserConfig> => {
  return runCommand<UserConfig>("get_user_config");
};

export const getFocusedSequence = (splitId: string): Promise<FocusedSequenceUpdatedPayload> => {
  return runCommand<FocusedSequenceUpdatedPayload>("get_focused_sequence", { splitId });
};

export const getFocusedRegion = (splitId: string): Promise<GenomicRegion> => {
  return runCommand<GenomicRegion>("get_focused_region", { splitId });
};

export const getReferenceSequence = (): Promise<ReferenceSequence> => {
  return runCommand<ReferenceSequence>("get_reference_sequence");
};

export const getSplits = (): Promise<SplitData[]> => {
  return runCommand<SplitMap>("get_splits").then((splitMap) => Object.values(splitMap));
};

export const getAlignments = ({
  trackId,
  splitId,
}: {
  trackId: string;
  splitId: string;
}): Promise<AlignmentStackKind> => {
  return runCommand<AlignmentStackKind>("get_alignments", { trackId, splitId });
};

export const initializeBackend = (): Promise<null> => {
  return runCommand<null>("initialize");
};

export const updateFocusedRegion = ({
  splitId,
  genomicRegion,
}: {
  splitId: string;
  readonly genomicRegion: GenomicRegion | GenomicRegion;
}): Promise<null> => {
  return runCommand<null>("update_focused_region", { splitId, genomicRegion });
};

export const listenForSplitAdded: EventListener<SplitData> = (handler) => {
  return tauriListen<SplitData>("split-added", handler);
};

export const listenForFocusedRegionUpdated: EventListener<FocusedRegionUpdatedPayload> = (
  handler
) => {
  return tauriListen<FocusedRegionUpdatedPayload>("focused-region-updated", handler);
};

export const listenForTrackAdded: EventListener<AlignmentTrackData> = (handler) => {
  return tauriListen("track-added", handler);
};

export const listenForNewAlert: EventListener<AlertData> = (handler) => {
  return tauriListen("new-alert", handler);
};

export const listenForAlertStatusUpdated: EventListener<AlertStatusUpdateParams> = (handler) => {
  return tauriListen("new-status-updated", handler);
};

export const listenForUserConfigUpdated: EventListener<UserConfig> = (handler) => {
  return tauriListen("user-config-updated", handler);
};

export const listenForFocusedSequenceUpdated: EventListener<FocusedSequenceUpdatedPayload> = (
  handler
) => {
  return tauriListen<FocusedSequenceUpdatedPayload>("focused-sequence-updated", handler);
};

export const listenForFocusedSequenceUpdateQueued: EventListener<FocusedSequenceUpdatedPayload> = (
  handler
) => {
  return tauriListen<FocusedSequenceUpdatedPayload>("focused-sequence-update-queued", handler);
};

export const listenForAlignmentsUpdated: EventListener<AlignmentsUpdatedPayload> = (handler) => {
  return tauriListen<AlignmentsUpdatedPayload>("alignments-updated", handler);
};

export const listenForAlignmentsUpdateQueued: EventListener<AlignmentsUpdatedPayload> = (
  handler
) => {
  return tauriListen<AlignmentsUpdatedPayload>("alignments-update-queued", handler);
};

export const listenForRegionBuffering: EventListener<RegionBufferingPayload> = (handler) => {
  return tauriListen<RegionBufferingPayload>("region-buffering", handler);
};

export const listenForRegionPanned: EventListener<FocusedRegionUpdatedPayload> = (handler) => {
  return tauriListen<FocusedRegionUpdatedPayload>("region-panned", handler);
};

export const listenForRegionZoomed: EventListener<FocusedRegionUpdatedPayload> = (handler) => {
  return tauriListen<FocusedRegionUpdatedPayload>("region-zoomed", handler);
};

export const listenForRefSeqFileUpdated: EventListener<ReferenceSequence> = (handler) => {
  return tauriListen<ReferenceSequence>("ref-seq-file-updated", handler);
};

/**
 * Open the system file dialog and return the files selecting by the user.
 * @returns A list of file paths.
 */
export const openFileDialog = async (): Promise<string[] | null> => {
  const selectedFiles = await open({ multiple: false });
  if (typeof selectedFiles === "string") {
    return [selectedFiles];
  }
  return selectedFiles;
};
