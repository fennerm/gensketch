/**
 * @jest-environment jsdom
 */

import { jest } from "@jest/globals";
import type { EventCallback, EventName } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";

import type { FocusedRegionUpdatedPayload } from "@lib/bindings";

jest.unstable_mockModule("@tauri-apps/api/event", () => ({
  listen: jest.fn((event: EventName, handler: EventCallback<any>) =>
    Promise.resolve(
      handler({
        event: "focused-region-updated",
        windowLabel: "fake",
        id: 1,
        payload: {
          splitId: "fake",
          genomicRegion: { seqName: "X", interval: { start: "1", end: "2" } },
        },
      })
    )
  ),
}));
const tauri = await import("./tauri");

afterEach(() => {
  clearMocks();
});

test("Big int conversion of command response", async () => {
  mockIPC((_cmd, _args) => {
    return { seqName: "X", interval: { start: "1", end: "2" } };
  });
  const region = await tauri.getFocusedRegion("fake-split-id");
  expect(region.interval.start).toBe(BigInt(1));
  expect(region.interval.end).toBe(BigInt(2));
});

test("Big int conversion of event payload", async () => {
  let payload: FocusedRegionUpdatedPayload | null = null;

  const handler: EventCallback<FocusedRegionUpdatedPayload> = (event) => {
    payload = event.payload;
  };

  tauri.listenForFocusedRegionUpdated(handler);
  expect(payload).not.toBe(null);
  expect(payload!.genomicRegion.interval.start).toBe(BigInt(1));
  expect(payload!.genomicRegion.interval.end).toBe(BigInt(2));
});
