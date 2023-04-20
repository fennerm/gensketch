import type { GenomicRegion } from "@lib/bindings";
import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "@lib/constants";
import { Scene } from "@lib/drawing/Scene";
import type { SceneParams } from "@lib/drawing/Scene";
import {
  DRAW_LETTER_THRESHOLD,
  type DrawConfig,
  DrawPoolGroup,
  drawRect,
  drawText,
} from "@lib/drawing/drawing";
import { getLength } from "@lib/genomicCoordinates";
import LOG from "@lib/logger";
import type { Dimensions } from "@lib/types";
import { Viewport } from "pixi-viewport";

const NUC_RECT_SUFFIX = "Rect";
const NUC_TEXT_SUFFIX = "Text";
const GAP_NUC = "GAP";

export class RefSeqScene extends Scene {
  drawPool: DrawPoolGroup;
  bufferDim: Dimensions;
  viewport: Viewport;
  focusedSequence: string | null;
  bufferedSequence: string | null;
  focusedRegion: GenomicRegion | null;
  bufferedRegion: GenomicRegion | null;
  nucWidth: number;

  constructor(params: SceneParams) {
    super(params);
    this.bufferDim = { width: 3 * this.dim.width, height: this.dim.height };
    this.viewport = new Viewport({
      screenWidth: this.dim.width,
      screenHeight: this.dim.height,
      worldWidth: this.bufferDim.width,
      worldHeight: this.bufferDim.height,
      events: this.pixiApp.renderer.events,
    });
    this.pixiApp.stage.addChild(this.viewport);
    this.viewport.drag().pinch().decelerate().clamp({ direction: "x" });
    this.drawPool = this.#initDrawPools();
    this.focusedSequence = null;
    this.bufferedSequence = null;
    this.focusedRegion = null;
    this.bufferedRegion = null;
    this.nucWidth = 0;
  }

  #initDrawPools = (): DrawPoolGroup => {
    const nucleotideColors = this.styles.colors.nucleotideColors;
    const drawConfig: DrawConfig = {};
    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: 10, height: 15 },
          }),
        poolsize: 1000,
      };
      drawConfig[nuc + NUC_TEXT_SUFFIX] = {
        drawFn: () => drawText({ text: nuc, style: { tint: nucColor, fontSize: 15 } }),
        poolsize: 100,
      };
    });
    SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: 10, height: 20 },
          }),
        poolsize: 10,
      };
      drawConfig[nuc + NUC_TEXT_SUFFIX] = {
        drawFn: () => drawText({ text: nuc, style: { tint: nucColor, fontSize: 15 } }),
        poolsize: 10,
      };
    });
    return new DrawPoolGroup({ drawConfig, stage: this.viewport });
  };

  setState = ({
    focusedSequence = this.focusedSequence,
    bufferedSequence = this.bufferedSequence,
    focusedRegion = this.focusedRegion,
    bufferedRegion = this.bufferedRegion,
    viewportWidth = this.dim.width,
  }: {
    focusedSequence?: string | null;
    bufferedSequence?: string | null;
    focusedRegion?: GenomicRegion | null;
    bufferedRegion?: GenomicRegion | null;
    viewportWidth?: number;
  }): void => {
    this.focusedSequence = focusedSequence;
    this.bufferedSequence = bufferedSequence;
    this.focusedRegion = focusedRegion;
    this.bufferedRegion = bufferedRegion;
    this.bufferedSequence = bufferedSequence;

    if (
      this.bufferedSequence === null ||
      this.focusedSequence === null ||
      this.focusedRegion === null ||
      this.bufferedRegion === null
    ) {
      return;
    }

    if (getLength(this.focusedRegion.interval) !== BigInt(this.focusedSequence.length)) {
      this.focusedSequence = this.bufferedSequence.substring(
        Number(this.focusedRegion.interval.start - this.bufferedRegion.interval.start),
        Number(this.focusedRegion.interval.end - this.bufferedRegion.interval.start)
      );
    }

    this.resize({ width: viewportWidth, height: this.dim.height });
    this.nucWidth = this.dim.width / this.focusedSequence.length;
    this.bufferDim = {
      width: this.nucWidth * this.bufferedSequence.length,
      height: this.dim.height,
    };
    this.viewport.resize(
      this.dim.width,
      this.dim.height,
      this.bufferDim.width,
      this.bufferDim.height
    );
    this.viewport.moveCorner(
      Number(this.focusedRegion.interval.start - this.bufferedRegion.interval.start) *
        this.nucWidth,
      0
    );
  };

  draw = () => {
    LOG.debug("Redrawing RefSeqView...");
    this.clear();
    if (
      this.bufferedSequence === null ||
      this.focusedSequence === null ||
      this.focusedRegion === null ||
      this.bufferedRegion === null
    ) {
      return;
    }

    LOG.debug(
      `Redrawing RefSeqView with nucWidth=${this.nucWidth}, bufferedSequence.length=${this.bufferedSequence.length},  viewportWidth=${this.dim.width}, viewportHeight=${this.dim.height}`
    );
    for (let i = 0; i < this.bufferedSequence.length; i++) {
      let nuc = this.bufferedSequence.charAt(i);
      nuc = nuc !== "-" ? nuc : GAP_NUC;
      const x = i * this.nucWidth;
      if (this.nucWidth > DRAW_LETTER_THRESHOLD) {
        this.drawPool.draw(nuc + NUC_TEXT_SUFFIX, {
          pos: { x, y: 0 },
        });
      } else {
        this.drawPool.draw(nuc + NUC_RECT_SUFFIX, {
          pos: { x, y: 0 },
          dim: { width: this.nucWidth, height: this.dim.height },
        });
      }
    }
  };
}
