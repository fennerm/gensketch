import { ParseError } from "./errors";
import { BackendGenomicRegion } from "./events";

const GENOMIC_REGION_REGEX = /(?<seqName>.*):(?<start>[0-9]+)-?(?<end>[0-9]+)?/;

class GenomicRegion {
  seqName: string;
  start: number;
  end: number;

  constructor({ seqName, start, end }: { seqName: string; start: number; end: number }) {
    if (start > end) {
      throw "Invalid genomic coordinates (start > end)";
    }
    this.seqName = seqName;
    this.start = start;
    this.end = end;
  }

  length(): number {
    return this.end - this.start;
  }

  to1IndexedString(): string {
    const reindexedStart = this.start + 1;
    if (reindexedStart == this.end) {
      return `${this.seqName}:${reindexedStart}`;
    } else {
      return `${this.seqName}:${reindexedStart}-${this.end}`;
    }
  }

  to0IndexedString(): string {
    return `${this.seqName}:${this.start}-${this.end}`;
  }

  static fromBackendEvent(region: BackendGenomicRegion): GenomicRegion {
    return new GenomicRegion({ seqName: region.seqName, start: region.start, end: region.end });
  }

  static from1IndexedString(value: string): GenomicRegion {
    const parsed = GENOMIC_REGION_REGEX.exec(value);
    if (
      parsed === null ||
      parsed.groups === undefined ||
      parsed.groups[1] === null ||
      parsed.groups[2] === null
    ) {
      throw new ParseError(`${value} is not a valid genomic region`);
    }
    const start = parseInt(parsed.groups.start);
    let end = parsed.groups.end === null ? null : parseInt(parsed.groups.end);
    if (isNaN(start) || (end !== null && isNaN(end))) {
      throw new ParseError(`${value} is not a valid genomic region (invalid start/end coordinate)`);
    }

    if (end === null) {
      end = start + 1;
    }

    return new GenomicRegion({ seqName: parsed.groups.seqName, start, end });
  }
}

export default GenomicRegion;
