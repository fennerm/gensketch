// TODO Replace these with typescript-definitions crate

export interface BackendReferenceSequence {
  name: string;
  path: string;
}

export interface BackendGenomicRegion {
  seqName: string;
  start: number;
  end: number;
}

export interface BackendSplit {
  id: string;
  focusedRegion: BackendGenomicRegion;
}

export interface BackendAlignmentTrack {
  id: string;
  name: string;
}

export interface BackendGenomicInterval {
  start: number;
  end: number;
}

export interface BackendSequenceDiffBase {
  type: string;
  interval: BackendGenomicInterval;
}

export interface BackendSequenceDiffWithSequence extends BackendSequenceDiffBase {
  sequence: string;
}

export interface BackendDel extends BackendSequenceDiffBase {
  type: "Del";
}

export interface BackendMismatch extends BackendSequenceDiffWithSequence {
  type: "Mismatch";
}

export interface BackendIns extends BackendSequenceDiffWithSequence {
  type: "Ins";
}

export interface BackendSoftClip extends BackendSequenceDiffWithSequence {
  type: "SoftClip";
}

export type BackendSequenceDiff = BackendDel | BackendMismatch | BackendIns | BackendSoftClip;

export interface BackendAlignedRead {
  read_name: string;
  region: BackendGenomicRegion;
  matePos: BackendGenomicRegion | null;
  diffs: BackendSequenceDiff[];
  isReverse: boolean;
}

export interface BackendAlignedPairBase {
  type: string;
  interval: BackendGenomicInterval;
}

export interface BackendPairedReads extends BackendAlignedPairBase {
  type: "PairedReadsKind";
  read1: BackendAlignedRead;
  read2: BackendAlignedRead;
}

export interface BackendUnpairedRead extends BackendAlignedPairBase {
  type: "UnpairedReadKind";
  read: BackendAlignedRead;
}

export interface BackendDiscordantRead extends BackendAlignedPairBase {
  type: "DiscordantReadKind";
  read: BackendAlignedRead;
}

export type BackendAlignedPair = BackendPairedReads | BackendUnpairedRead | BackendDiscordantRead;

export interface BackendAlignmentStack {
  rows: BackendAlignedPair[];
}
