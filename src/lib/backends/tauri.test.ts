import { jest } from "@jest/globals";

jest.unstable_mockModule("@tauri-apps/api", () => ({
  invoke: jest.fn((_cmd, _args) =>
    Promise.resolve({ seqName: "X", interval: { start: "1", end: "2" } })
  ),
}));
const tauri = await import("./tauri");

test("Big int conversion of command response", async () => {
  const region = await tauri.getFocusedRegion("fake-split-id");
  expect(region.interval.start).toBe(BigInt(1));
  expect(region.interval.end).toBe(BigInt(2));
});
