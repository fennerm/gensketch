import {
  to0IndexedString,
  to1IndexedString,
  parse1IndexedCoordinates,
  getLength,
} from "./genomicCoordinates";
import { ParseError } from "./errors";
import { monkeyPatchBigInt } from "./util";

monkeyPatchBigInt();

test("to0IndexedString", async () => {
  const region = { seqName: "X", interval: { start: 0n, end: 10n } };
  expect(to0IndexedString(region)).toEqual("X:0-10");
});

test("to1IndexedString works", async () => {
  const region = { seqName: "X", interval: { start: 0n, end: 10n } };
  expect(to1IndexedString(region)).toEqual("X:1-10");
});

test("parse1IndexedCoordinates happy path", async () => {
  const expectedRegion = { seqName: "X", interval: { start: 0n, end: 10n } };
  expect(parse1IndexedCoordinates("X:1-10")).toEqual(expectedRegion);
});

test("parse1IndexedCoordinates works with missing end coordinate", async () => {
  const expectedRegion = { seqName: "X", interval: { start: 0n, end: 1n } };
  expect(parse1IndexedCoordinates("X:1")).toEqual(expectedRegion);
});

test("parse1IndexedCoordinates throws error for missing seq name", async () => {
  expect(() => parse1IndexedCoordinates("1-10")).toThrow(ParseError);
});

test("parse1IndexedCoordinates throws error for missing start coordinate", async () => {
  expect(() => parse1IndexedCoordinates("X:-1")).toThrow(ParseError);
});

test("parse1IndexedCoordinates throws error for non-numeric coordinate", async () => {
  expect(() => parse1IndexedCoordinates("X:A-100")).toThrow(ParseError);
});

test("getLength with GenomicRegion", async () => {
  const region = { seqName: "X", interval: { start: 0n, end: 10n } };
  expect(getLength(region)).toEqual(10n);
});

test("getLength with GenomicInterval", async () => {
  const interval = { start: 0n, end: 10n };
  expect(getLength(interval)).toEqual(10n);
});

test("getLength with 0 length GenomicInterval", async () => {
  const interval = { start: 0n, end: 0n };
  expect(getLength(interval)).toEqual(0n);
});
