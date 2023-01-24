import { GenomicInterval, GenomicRegion } from "../bindings";
import { ParseError } from "../lib/errors";

const GENOMIC_REGION_REGEX = /(?<seqName>.*):(?<start>[0-9]+)-?(?<end>[0-9]+)?/;

export const to1IndexedString = (region: GenomicRegion): string => {
  const reindexedStart = region.start + 1n;
  if (reindexedStart == region.end) {
    return `${region.seqName}:${reindexedStart}`;
  } else {
    return `${region.seqName}:${reindexedStart}-${region.end}`;
  }
};

export const to0IndexedString = (region: GenomicRegion): string => {
  return `${region.seqName}:${region.start}-${region.end}`;
};

export const parse1IndexedCoordinates = (value: string): GenomicRegion => {
  const parsed = GENOMIC_REGION_REGEX.exec(value);
  if (
    parsed === null ||
    parsed.groups === undefined ||
    parsed.groups[1] === null ||
    parsed.groups[2] === null
  ) {
    throw new ParseError(`${value} is not a valid genomic region`);
  }
  const start = BigInt(parsed.groups.start) - 1n;
  let end = parsed.groups.end === null ? null : BigInt(parsed.groups.end);
  if (isNaN(Number(start)) || (end !== null && isNaN(Number(end)))) {
    throw new ParseError(`${value} is not a valid genomic region (invalid start/end coordinate)`);
  }

  if (end === null) {
    end = start + 1n;
  }

  return { seqName: parsed.groups.seqName, start, end };
};

export const getLength = (region: GenomicInterval | GenomicRegion): bigint => {
  return region.end - region.start;
};
