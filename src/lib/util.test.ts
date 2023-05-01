import { adjustDimensions } from "./util";

const rounded = (floats: number[]): number[] => {
  return floats.map((f) => Math.round(f));
};

test("adjustDimensions works when item resized left", async () => {
  const dimensions = [50, 50];
  const newDim = adjustDimensions({ dimensions, targetIndex: 0, targetPos: 10, minDim: 2 });
  expect(rounded(newDim)).toEqual([10, 90]);
});

test("adjustDimensions works when item resized right", async () => {
  const dimensions = [50, 50];
  const newDim = adjustDimensions({ dimensions, targetIndex: 0, targetPos: 90, minDim: 2 });
  expect(rounded(newDim)).toEqual([90, 10]);
});

test("adjustDimensions respects minDim", async () => {
  const dimensions = [50, 50];
  const newDim = adjustDimensions({ dimensions, targetIndex: 0, targetPos: 99, minDim: 2 });
  expect(rounded(newDim)).toEqual([98, 2]);
});

test("adjustDimensions left works with >2 items", async () => {
  const dimensions = [25, 25, 25, 25];
  const newDim = adjustDimensions({ dimensions, targetIndex: 2, targetPos: 60, minDim: 2 });
  expect(rounded(newDim)).toEqual([25, 25, 10, 40]);
});

test("adjustDimensions right works with >2 items", async () => {
  const dimensions = [2, 2, 96];
  const newDim = adjustDimensions({ dimensions, targetIndex: 1, targetPos: 55, minDim: 2 });
  expect(rounded(newDim)).toEqual([2, 53, 45]);
});

test("adjustDimensions if some items hits minimum before others", async () => {
  const dimensions = [25, 5, 45, 25];
  const newDim = adjustDimensions({ dimensions, targetIndex: 2, targetPos: 10, minDim: 2 });
  expect(rounded(newDim)).toEqual([2, 2, 6, 90]);
});

test("adjustDimensions works when >2 items need to be adjusted", async () => {
  const dimensions = [25, 25, 25, 25];
  const newDim = adjustDimensions({ dimensions, targetIndex: 2, targetPos: 15, minDim: 2 });
  expect(rounded(newDim)).toEqual([5, 5, 5, 85]);
});

test("adjustDimensions works when diff is too large for minDim", async () => {
  const dimensions = [25, 25, 25, 25];
  const newDim = adjustDimensions({ dimensions, targetIndex: 2, targetPos: 20, minDim: 15 });
  expect(rounded(newDim)).toEqual([15, 15, 15, 55]);
});
