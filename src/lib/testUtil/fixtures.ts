/** Reusable test fixtures. */
import type { UserConfig } from "@lib/bindings";

export const fakeUserConfig = (): UserConfig => {
  return {
    styles: {
      colors: {
        background: 0xffffff,
        alignment: 0x000000,
        text: 0x000000,
        error: 0xff0000,
        errorBackground: 0xff0000,
        trackLabelBackground: 0x000000,
        secondaryText: 0xffffff,
        nucleotideColors: {
          A: 0xff0000,
          G: 0x00ff00,
          C: 0x0000ff,
          T: 0x00000f,
          N: 0x000000,
          R: 0x000000,
          Y: 0x000000,
          K: 0x000000,
          M: 0x000000,
          S: 0x000000,
          W: 0x000000,
          B: 0x000000,
          D: 0x000000,
          H: 0x000000,
          V: 0x000000,
          GAP: 0x000000,
        },
        deletion: 0x000000,
        insertion: 0x000000,
      },
      fonts: {
        tooltipFontSize: 12,
      },
    },
  };
};
