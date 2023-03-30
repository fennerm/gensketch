// Bindings to types returned from the backend.
//
// These are manually updated for the time being. I experimented with auto-generating them with
// ts-rs but it became a huge mess due to problems with bigint serialization.
import type { IUPACNucleotide } from "@lib/types";

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

export type AlignmentStackKind = { type: "alignedPairKind" } & AlignmentStack<AlignedPair>;

export interface AlignmentTrackData {
  id: string;
  bamPath: string;
  name: string;
}

export interface AlignmentsUpdatedPayload {
  trackId: string;
  splitId: string;
  focusedRegion: GenomicRegion;
  alignments: AlignmentStackKind;
}

export interface DiscordantRead {
  read: AlignedRead;
  interval: GenomicInterval;
}

export interface FocusedRegionUpdatedPayload {
  splitId: string;
  genomicRegion: GenomicRegion;
}

export interface FocusedSequenceUpdatedPayload {
  splitId: string;
  sequence: string;
}

export interface GenomicInterval {
  start: bigint;
  end: bigint;
}

export interface GenomicRegion {
  seqName: string;
  interval: GenomicInterval;
}

export interface PairedReads {
  read1: AlignedRead;
  read2: AlignedRead | null;
  interval: GenomicInterval;
}

export type SequenceDiff =
  | { type: "mismatch"; interval: GenomicInterval; sequence: string }
  | { type: "ins"; interval: GenomicInterval; sequence: string }
  | { type: "del"; interval: GenomicInterval }
  | { type: "softClip"; interval: GenomicInterval; sequence: string };

export interface SplitData {
  id: string;
  focusedRegion: GenomicRegion;
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
  status: AlertStatusValue;
  message: string;
}

export interface AlertStatusUpdateParams {
  alertId: string;
  newStatus: AlertStatusValue;
}

export type NucleotideColorConfig = {
  [nuc in IUPACNucleotide]: number;
};

export interface ColorConfig {
  background: number;
  text: number;
  alignment: number;
  trackLabelBackground: number;
  secondaryText: number;
  nucleotideColors: NucleotideColorConfig;
}

export interface StyleConfig {
  colors: ColorConfig;
}

export interface UserConfig {
  styles: StyleConfig;
}

export type SeqLengthMap = {
  [seqName: string]: bigint;
};

export interface ReferenceSequence {
  name: string;
  path: string;
  defaultFocusedRegion: GenomicRegion;
  seqLengths: SeqLengthMap;
}
