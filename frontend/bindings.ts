// Bindings to types returned from the backend.
//
// These are manually updated for the time being. I experimented with auto-generating them with
// ts-rs but it became a huge mess due to problems with bigint serialization.

export type AlignedPair =
  | ({ type: "pairedReadsKind" } & PairedReads)
  | ({ type: "unpairedReadKind" } & UnpairedRead)
  | ({ type: "discordantReadKind" } & DiscordantRead);

export interface AlignedRead {
  readName: string;
  region: GenomicRegion;
  matePos: GenomicRegion | null;
  diffs: Array<SequenceDiff>;
  isReverse: boolean;
}

export interface AlignmentStack<T> {
  rows: Array<Array<T>>;
}

export interface AlignmentTrackData {
  id: string;
  bamPath: string;
  name: string;
}

export interface DiscordantRead {
  read: AlignedRead;
  interval: GenomicInterval;
}

export interface FocusedRegionUpdated {
  splitId: string;
  genomicRegion: GenomicRegion | null;
}

export interface GenomicInterval {
  start: bigint;
  end: bigint;
}

export interface GenomicRegion {
  seqName: string;
  start: bigint;
  end: bigint;
}

export interface PairedReads {
  read1: AlignedRead;
  read2: AlignedRead | null;
  interval: GenomicInterval;
}

export interface ReferenceSequenceData {
  name: string;
  path: string;
}

export type SequenceDiff =
  | { type: "mismatch"; interval: GenomicInterval; sequence: string }
  | { type: "ins"; interval: GenomicInterval; sequence: string }
  | { type: "del"; interval: GenomicInterval }
  | { type: "softClip"; interval: GenomicInterval; sequence: string };

export interface SplitData {
  id: string;
  focusedRegion: GenomicRegion | null;
}

export interface SplitList {
  splits: Array<SplitData>;
}

export type TrackData = AlignmentTrackData;

export interface TrackList {
  tracks: Array<TrackData>;
}

export interface UnpairedRead {
  read: AlignedRead;
  interval: GenomicInterval;
}

export type AlertStatusValue = "error" | "inProgress" | "complete";

export interface AlertData {
  id: string;
  status: AlertStatusValue;
  message: string;
  detailedMessage: string | null;
}

export interface AlertStatusUpdateParams {
  alertID: string;
  newStatus: AlertStatusValue;
}
