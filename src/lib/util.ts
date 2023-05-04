import { sum } from "lodash-es";

export const monkeyPatchBigInt = () => {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    get() {
      "use strict";
      return () => String(this);
    },
  });
};

export function range(start: bigint, end: bigint): bigint[];
export function range(start: number, end: number): number[];
export function range(start: any, end: any): any[] {
  if (typeof start === "bigint" && typeof end === "bigint") {
    return Array.from({ length: Number(end - start) }, (_, i) => BigInt(i) + start);
  } else {
    return Array.from({ length: Number(end - start) }, (_, i) => i + start);
  }
}

export const hexToString = (hex: number): string => {
  let hexString = `${hex.toString(16)}`;
  if (hexString.length < 3) {
    hexString = hexString.padStart(3 - hexString.length, "0");
  }
  hexString = "#" + hexString;
  return hexString;
};

export const isString = (value: unknown): value is string => {
  return typeof value === "string";
};

/**
 * Given an array of dimensions, return an array of positions. E.g. [100, 200, 300] -> [0, 100, 300]
 */
const dimToPosArray = (dimensions: number[]): number[] => {
  let currentPos = 0;
  return dimensions.map((dim) => {
    const pos = currentPos;
    currentPos = pos + dim;
    return pos;
  });
};

/**
 * Given we have a set of dimensions and one of the endpoints is moved, adjust the dimensions so
 * that the moved endpoint is at the specified position, and the sum of the dimensions stays the
 * same.
 *
 * @param currentDimensions - An array of dimensions. E.g representing the widths of three columns
 *  in a table.
 * @param targetIndex - The index of the item that was resized.
 * @param targetPos - The position the item was resized to.
 * */
export const adjustDimensions = ({
  dimensions,
  targetIndex,
  targetPos,
  minDim,
}: {
  readonly dimensions: number[];
  targetIndex: number;
  targetPos: number;
  minDim: number;
}): number[] => {
  // Calculate a cumulative sum of the splits/tracks up to the current one. This is used to
  // determine where the mouse is in relation to the current split/track.
  const positions = dimToPosArray(dimensions);

  // The percentage to change the affected split/track by. The remaining splits/tracks will be
  // reduced by an equal fraction of this amount.
  let diff = Math.abs(targetPos - positions[targetIndex + 1]);

  // Is the targetIndex being resized to the left or the right?
  const direction = targetPos > positions[targetIndex + 1] ? "right" : "left";

  // Items which need to have their dimensions reduced
  // If dragging to the right, we need to reduce all items to the right of the target
  // If dragging to the left, we need to reduce the target itself and all items to the left
  const idxToShrink = range(0, dimensions.length).filter(
    (idx) =>
      (direction === "right" && idx > targetIndex && positions[idx] <= targetPos) ||
      (direction === "left" && idx <= targetIndex && positions[idx + 1] >= targetPos)
  );

  // We cannot reduce items any further than their minimum size
  diff = Math.min(
    sum(idxToShrink.map((idx) => dimensions[idx])) - idxToShrink.length * minDim,
    diff
  );

  // Iteratively reduce the dimensions of the items until we've accounted for the full diff.
  // We cant simply subtract the same amount from each item because we may hit the minimum size
  const newDimensions = [...dimensions];
  let remainder = diff;
  while (Math.round(remainder) !== 0) {
    const diffFraction = remainder / idxToShrink.length;
    idxToShrink.forEach((idx) => {
      if (newDimensions[idx] <= minDim) {
        return;
      }
      const toSubtract = Math.min(newDimensions[idx] - minDim, diffFraction);
      newDimensions[idx] -= toSubtract;
      remainder -= toSubtract;
    });
  }
  if (direction === "left") {
    newDimensions[targetIndex + 1] += diff;
  } else {
    newDimensions[targetIndex] += diff;
  }
  return newDimensions;
};
