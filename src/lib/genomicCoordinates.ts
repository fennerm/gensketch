import type { GenomicInterval, GenomicRegion } from "@lib/bindings";
import { ParseError } from "@lib/errors";

const GENOMIC_REGION_REGEX = /(?<seqName>.*):(?<start>[0-9]+)-?(?<end>[0-9]+)?/;

export const to1IndexedString = (region: GenomicRegion): string => {
  const reindexedStart = region.interval.start + 1n;
  if (reindexedStart == region.interval.end) {
    return `${region.seqName}:${reindexedStart}`;
  } else {
    return `${region.seqName}:${reindexedStart}-${region.interval.end}`;
  }
};

export const to0IndexedString = (region: GenomicRegion): string => {
  return `${region.seqName}:${region.interval.start}-${region.interval.end}`;
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
  let end = parsed.groups.end === undefined ? null : BigInt(parsed.groups.end);
  if (isNaN(Number(start)) || (end !== null && isNaN(Number(end)))) {
    throw new ParseError(`${value} is not a valid genomic region (invalid start/end coordinate)`);
  }

  if (end === null) {
    end = start + 1n;
  }

  return { seqName: parsed.groups.seqName, interval: { start, end } };
};

export const isGenomicRegion = (value: any): value is GenomicRegion => {
  return value.seqName !== undefined && value.interval !== undefined;
};

export const getLength = (region: GenomicInterval | GenomicRegion): bigint => {
  let interval: GenomicInterval;
  if (isGenomicRegion(region)) {
    interval = region.interval;
  } else {
    interval = region;
  }
  return interval.end - interval.start;
};
