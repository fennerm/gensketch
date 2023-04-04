import type {
  AlignedPair,
  AlignedRead,
  AlignmentStackKind,
  GenomicRegion,
  PairedReads,
  StyleConfig,
} from "@lib/bindings";
import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "@lib/constants";
import { Scene } from "@lib/drawing/Scene";
import type { SceneParams } from "@lib/drawing/Scene";
import {
  DRAW_LETTER_THRESHOLD,
  type DrawConfig,
  DrawPoolGroup,
  drawRect,
  drawText,
  drawTriangle,
  updateIfChanged,
} from "@lib/drawing/drawing";
import { getLength, to1IndexedString } from "@lib/genomicCoordinates";
import LOG from "@lib/logger";
import type { Dimensions, Position } from "@lib/types";
import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";
import type { Style } from "util";

const MAX_ALIGNMENT_HEIGHT = 24;
const READ_BODY_POOL = "readBody";
const PAIR_LINE_POOL = "pairLine";
const FORWARD_READ_CAP_POOL = "forwardReadCap";
const REVERSE_READ_CAP_POOL = "reverseReadCap";
const NUC_RECT_SUFFIX = "SnvRect";
const NUC_TEXT_SUFFIX = "SnvText";
const DEFAULT_READ_HEIGHT = 10;
const DEFAULT_READ_WIDTH = 100;
const DEFAULT_CAP_WIDTH = 10;
const DEFAULT_PAIR_LINE_HEIGHT = 1;
const DEFAULT_PAIR_LINE_WIDTH = 100;
const DEFAULT_NUC_WIDTH = DEFAULT_CAP_WIDTH;

export interface AlignedReadsTextures {
  forwardReadCap: PIXI.RenderTexture;
  reverseReadCap: PIXI.RenderTexture;
}

class TooltipField extends PIXI.Container {
  spacing: number = 6;
  keyStyle: PIXI.TextStyle;
  valueStyle: PIXI.TextStyle;
  key: PIXI.Text;
  value: PIXI.Text;

  constructor({
    key,
    keyStyle,
    valueStyle,
  }: {
    key: string;
    readonly keyStyle: PIXI.TextStyle;
    readonly valueStyle: PIXI.TextStyle;
  }) {
    super();
    this.keyStyle = keyStyle;
    this.valueStyle = valueStyle;
    this.key = new PIXI.Text(key + ":", this.keyStyle);
    this.addChild(this.key);
    this.value = new PIXI.Text("", valueStyle);
    this.value.position.set(this.key.width + this.spacing, 0);
    this.addChild(this.value);
  }
}

class AlignedReadTooltip extends PIXI.Container {
  styles: StyleConfig;
  numFields: number = 3;
  hPad: number = 6;
  vPad: number = 3;
  lineHeight: number;
  background: PIXI.Sprite;
  keyStyle: PIXI.TextStyle;
  valueStyle: PIXI.TextStyle;
  readName: TooltipField;
  coordinates: TooltipField;
  cigar: TooltipField;
  #maxFieldWidth: number;
  #fieldIndex: number;

  constructor({ styles }: { readonly styles: StyleConfig }) {
    super();
    this.styles = styles;
    this.lineHeight = this.styles.fonts.tooltipFontSize + 2;
    this.background = drawRect({
      color: styles.colors.background,
      dim: { width: 100, height: this.vPad * 2 + this.lineHeight * this.numFields },
      zIndex: 100,
    });
    this.addChild(this.background);
    this.keyStyle = new PIXI.TextStyle({
      fontSize: this.styles.fonts.tooltipFontSize,
      fontWeight: "bold",
    });
    this.valueStyle = new PIXI.TextStyle({ fontSize: this.styles.fonts.tooltipFontSize });
    this.#fieldIndex = 0;
    this.#maxFieldWidth = 0;
    this.readName = this.#initField("Name");
    this.coordinates = this.#initField("Coordinates");
    this.cigar = this.#initField("CIGAR");
  }

  #initField = (key: string): TooltipField => {
    const field = new TooltipField({
      key,
      keyStyle: this.keyStyle,
      valueStyle: this.valueStyle,
    });
    field.position.set(this.hPad, this.vPad + this.#fieldIndex * this.lineHeight);
    this.#fieldIndex++;
    this.addChild(field);
    return field;
  };

  #updateField(field: TooltipField, text: string): void {
    field.value.text = text;
    if (field.width > this.#maxFieldWidth) {
      this.#maxFieldWidth = field.width;
    }
  }

  setRead = (read: AlignedRead): void => {
    this.#maxFieldWidth = 0;
    this.#updateField(this.readName, read.id);
    this.#updateField(this.coordinates, to1IndexedString(read.region));
    this.#updateField(this.cigar, read.cigarString);
    this.background.width = 2 * this.hPad + this.#maxFieldWidth;
  };
}

export class AlignedReadsScene extends Scene {
  drawPool: DrawPoolGroup;
  bufferDim: Dimensions;
  viewport: Viewport;
  textures: AlignedReadsTextures;
  focusedRegion: GenomicRegion | null;
  alignments: AlignmentStackKind | null;
  tooltip: AlignedReadTooltip;
  focusedRegionLength: number;
  bufferedRegionLength: number;
  nucWidth: number;
  readHeight: number;
  rowHeight: number;

  constructor(params: SceneParams) {
    super(params);
    this.bufferDim = { width: 3 * this.dim.width, height: 3 * this.dim.height };
    this.viewport = new Viewport({
      screenWidth: this.dim.width,
      screenHeight: this.dim.height,
      worldWidth: this.bufferDim.width,
      worldHeight: this.bufferDim.height,
      events: this.pixiApp.renderer.events,
    });
    this.pixiApp.stage.addChild(this.viewport);
    this.viewport.drag().pinch().decelerate().clamp({ direction: "all" });
    this.textures = this.#initTextures();
    this.drawPool = this.#initDrawPools();
    this.tooltip = this.#initTooltip();
    this.focusedRegion = null;
    this.alignments = null;
    this.focusedRegionLength = 0;
    this.bufferedRegionLength = 0;
    this.nucWidth = 0;
    this.readHeight = 0;
    this.rowHeight = 0;
  }

  #initTooltip = (): AlignedReadTooltip => {
    const tooltip = new AlignedReadTooltip({ styles: this.styles });
    tooltip.visible = false;
    this.viewport.addChild(tooltip);
    return tooltip;
  };

  destroy = () => {
    this.pixiApp.destroy();
    this.textures.forwardReadCap.destroy();
    this.textures.reverseReadCap.destroy();
  };

  #initReadCapTexture = (): PIXI.RenderTexture => {
    const texture = PIXI.RenderTexture.create({
      width: DEFAULT_CAP_WIDTH,
      height: DEFAULT_READ_HEIGHT,
      multisample: PIXI.MSAA_QUALITY.HIGH,
      resolution: window.devicePixelRatio,
    });
    return texture;
  };

  #initTextures = (): AlignedReadsTextures => {
    const textures = {
      forwardReadCap: this.#initReadCapTexture(),
      reverseReadCap: this.#initReadCapTexture(),
    };
    const forwardReadCapTemplate = drawTriangle({
      vertices: [
        { x: 0, y: 0 },
        { x: DEFAULT_CAP_WIDTH, y: DEFAULT_READ_HEIGHT / 2 },
        { x: 0, y: DEFAULT_READ_HEIGHT },
      ],
      color: 0xffffff,
    });
    const reverseReadCapTemplate = drawTriangle({
      vertices: [
        { x: DEFAULT_CAP_WIDTH, y: 0 },
        { x: DEFAULT_CAP_WIDTH, y: DEFAULT_READ_HEIGHT },
        { x: 0, y: DEFAULT_READ_HEIGHT / 2 },
      ],
      color: 0xffffff,
    });

    this.pixiApp.loadRenderTexture({
      shape: forwardReadCapTemplate,
      texture: textures.forwardReadCap,
    });
    this.pixiApp.loadRenderTexture({
      shape: reverseReadCapTemplate,
      texture: textures.reverseReadCap,
    });

    // Required for MSAA, WebGL 2 only
    this.pixiApp.renderer.framebuffer.blit();
    return textures;
  };

  #drawReadCap = ({
    texture,
    pos,
    dim,
    color,
    zIndex,
  }: {
    texture: PIXI.RenderTexture;
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    zIndex?: number;
  }): PIXI.Sprite => {
    pos = pos === undefined ? { x: 0, y: 0 } : pos;
    dim = dim === undefined ? { width: DEFAULT_CAP_WIDTH, height: DEFAULT_READ_HEIGHT } : dim;
    const cap = new PIXI.Sprite(texture);
    cap.setTransform();
    cap.interactive = true;
    if (color !== undefined) {
      cap.tint = color;
    }
    updateIfChanged({ container: cap, pos, dim, zIndex });
    return cap;
  };

  #drawForwardReadCap = ({
    pos,
    dim,
    color,
    zIndex,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    zIndex?: number;
  }): PIXI.Sprite => {
    return this.#drawReadCap({ texture: this.textures.forwardReadCap, pos, dim, color, zIndex });
  };

  #drawReverseReadCap = ({
    pos,
    dim,
    color,
    zIndex,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    zIndex?: number;
  }): PIXI.Sprite => {
    return this.#drawReadCap({ texture: this.textures.reverseReadCap, pos, dim, color, zIndex });
  };

  #initDrawPools = (): DrawPoolGroup => {
    const drawConfig: DrawConfig = {};
    const alignmentColor = this.styles.colors.alignment;
    drawConfig[PAIR_LINE_POOL] = {
      drawFn: () =>
        drawRect({
          color: 0x000000,
          dim: { width: DEFAULT_PAIR_LINE_WIDTH, height: DEFAULT_PAIR_LINE_HEIGHT },
          zIndex: 0,
        }),
      poolsize: 500,
    };
    drawConfig[READ_BODY_POOL] = {
      drawFn: () =>
        drawRect({
          color: alignmentColor,
          interactive: true,
          dim: { width: DEFAULT_READ_WIDTH, height: DEFAULT_READ_HEIGHT },
          zIndex: 1,
        }),
      poolsize: 500,
    };
    drawConfig[FORWARD_READ_CAP_POOL] = {
      drawFn: () => this.#drawForwardReadCap({ color: alignmentColor, zIndex: 1 }),
      poolsize: 250,
    };
    drawConfig[REVERSE_READ_CAP_POOL] = {
      drawFn: () => this.#drawReverseReadCap({ color: alignmentColor, zIndex: 1 }),
      poolsize: 250,
    };
    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = this.styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: DEFAULT_NUC_WIDTH, height: DEFAULT_READ_HEIGHT },
            zIndex: 2,
          }),
        poolsize: 200,
      };
      drawConfig[nuc + NUC_TEXT_SUFFIX] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor }, zIndex: 2 }),
        poolsize: 50,
      };
    });
    SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = this.styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: DEFAULT_NUC_WIDTH, height: DEFAULT_READ_HEIGHT },
            zIndex: 2,
          }),
        poolsize: 5,
      };
      drawConfig[nuc + NUC_TEXT_SUFFIX] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor }, zIndex: 2 }),
        poolsize: 5,
      };
    });
    return new DrawPoolGroup({ drawConfig, stage: this.viewport });
  };

  #drawPairLine = ({
    pos,
    readHeight,
    alignment,
  }: {
    readonly pos: Position;
    readHeight: number;
    readonly alignment: PairedReads;
  }): void => {
    const linePos = { x: pos.x, y: pos.y + readHeight / 2 };
    const dim = {
      width: Number(alignment.interval.end - alignment.interval.start) * this.nucWidth,
      height: 0.5,
    };
    this.drawPool.draw(PAIR_LINE_POOL, { pos: linePos, dim });
  };

  #drawDiffs = ({
    read,
    pos,
    height,
  }: {
    readonly read: AlignedRead;
    readonly pos: Position;
    height: number;
  }): void => {
    read.diffs.forEach((diff) => {
      switch (diff.type) {
        case "mismatch": {
          const diffX =
            Number(diff.interval.start - this.focusedRegion!.interval.start) * this.nucWidth;
          const nuc = diff.sequence !== "-" ? diff.sequence : "GAP";
          if (this.nucWidth > DRAW_LETTER_THRESHOLD) {
            this.drawPool.draw(nuc + NUC_TEXT_SUFFIX, {
              pos: { x: diffX, y: pos.y },
              fontSize: height - 2,
            });
          } else {
            this.drawPool.draw(nuc + NUC_RECT_SUFFIX, {
              pos: { x: diffX, y: pos.y },
              dim: { width: this.nucWidth, height },
            });
          }
          break;
        }
        case "ins":
          break;
        case "del":
          break;
        case "softClip":
          break;
      }
    });
  };

  #drawTooltip = ({ read, pos }: { readonly read: AlignedRead; pos: Position }) => {
    this.tooltip.setRead(read);
    if (pos.x + this.tooltip.width + 5 > this.canvas.offsetLeft + this.canvas.offsetWidth) {
      this.tooltip.x = pos.x - this.tooltip.width;
    } else {
      this.tooltip.x = pos.x;
    }
    if (pos.y + this.tooltip.height + 5 > this.canvas.offsetTop + this.canvas.offsetHeight) {
      this.tooltip.y = pos.y - this.tooltip.height;
    } else {
      this.tooltip.y = pos.y;
    }
    this.tooltip.visible = true;
    this.viewport.addChild(this.tooltip);
  };

  #destroyTooltip = (): void => {
    this.tooltip.visible = false;
  };

  #drawRead = ({
    read,
    pos,
    height,
  }: {
    readonly read: AlignedRead;
    readonly pos: Position;
    height: number;
  }): void => {
    const width = Number(read.region.interval.end - read.region.interval.start) * this.nucWidth;

    const onMouseOver = (event: PIXI.FederatedPointerEvent): void => {
      this.#drawTooltip({ read, pos: { x: event.data.global.x, y: event.data.global.y } });
    };

    const onMouseOut = (event: PIXI.FederatedPointerEvent): void => {
      this.#destroyTooltip();
    };

    const capWidth = 5;
    if (read.isReverse) {
      this.drawPool.draw(REVERSE_READ_CAP_POOL, {
        pos: { x: pos.x - capWidth, y: pos.y },
        dim: { width: capWidth, height },
        onMouseOver,
        onMouseOut,
      });
    } else {
      this.drawPool.draw(FORWARD_READ_CAP_POOL, {
        pos: { x: pos.x + width - 1, y: pos.y },
        dim: { width: capWidth, height },
        onMouseOver,
        onMouseOut,
      });
    }

    this.drawPool.draw(READ_BODY_POOL, {
      pos,
      dim: { width, height },
      onMouseOver,
      onMouseOut,
    });
    this.#drawDiffs({ read, pos, height });
  };

  #drawAlignment = ({
    alignment,
    pos,
    height,
  }: {
    readonly alignment: AlignedPair;
    readonly pos: Position;
    height: number;
  }): void => {
    let reads;
    if (alignment.type == "pairedReadsKind") {
      reads = [alignment.read1, alignment.read2];
      this.#drawPairLine({ pos, alignment, readHeight: height });
    } else {
      reads = [alignment.read];
    }
    reads.forEach((read) => {
      if (read === null) {
        return;
      }
      let readX =
        pos.x + Number(read.region.interval.start - alignment.interval.start) * this.nucWidth;
      if (readX < 0) {
        readX = 0;
      }
      try {
        this.#drawRead({ read, pos: { x: readX, y: pos.y }, height });
      } catch {
        LOG.warn(JSON.stringify(read));
      }
    });
  };

  setState = ({
    alignments,
    focusedRegion,
    viewportWidth,
    viewportHeight,
  }: {
    alignments?: AlignmentStackKind;
    focusedRegion?: GenomicRegion;
    viewportWidth?: number;
    viewportHeight?: number;
  }): void => {
    if (alignments !== undefined) {
      this.alignments = alignments;
    }
    if (focusedRegion !== undefined) {
      if (focusedRegion !== this.focusedRegion) {
        this.#destroyTooltip();
      }
      this.focusedRegion = focusedRegion;
    }
    if (this.alignments === null || this.focusedRegion === null) {
      return;
    }
    if (viewportWidth === undefined) {
      viewportWidth = this.dim.width;
    } else if (viewportWidth !== this.dim.width) {
      this.#destroyTooltip();
    }
    if (viewportHeight === undefined) {
      viewportHeight = this.dim.height;
    } else if (viewportHeight !== this.dim.height) {
      this.#destroyTooltip();
    }
    this.resize({ width: viewportWidth, height: viewportHeight });
    this.focusedRegionLength = Number(getLength(this.focusedRegion.interval));
    this.bufferedRegionLength = Number(getLength(this.alignments.bufferedRegion.interval));
    this.nucWidth = this.dim.width / this.focusedRegionLength;
    this.readHeight = Math.min(40 * this.nucWidth, MAX_ALIGNMENT_HEIGHT);
    this.rowHeight = this.readHeight + 2;
    this.bufferDim = {
      width: this.nucWidth * this.bufferedRegionLength,
      height: this.rowHeight * this.alignments.rows.length,
    };
    this.viewport.resize(
      this.dim.width,
      this.dim.height,
      this.bufferDim.width,
      this.bufferDim.height
    );
    this.viewport.moveCorner(
      Number(this.focusedRegion.interval.start - this.alignments.bufferedRegion.interval.start) *
        this.nucWidth,
      0
    );
  };

  draw = () => {
    if (this.alignments === null || this.focusedRegion === null) {
      LOG.warn("Attempted to draw AlignedReadsScene with uninitialized state");
      return;
    }
    this.clear();
    this.#destroyTooltip();

    LOG.debug(
      `Redrawing AlignmentsView with nucWidth=${this.nucWidth}, regionLength=${
        this.focusedRegionLength
      }, numRows=${this.alignments.rows.length}, region=${JSON.stringify(
        this.focusedRegion
      )}, width=${this.dim.width}, height=${this.dim.height}, bufferWidth=${
        this.bufferDim.width
      }, bufferHeight=${this.bufferDim.height}`
    );
    let y = 0;
    this.alignments.rows.forEach((row) => {
      row.forEach((alignment) => {
        const x =
          Number(BigInt(alignment.interval.start) - this.focusedRegion!.interval.start) *
          this.nucWidth;
        this.#drawAlignment({
          alignment,
          pos: { x, y },
          height: this.readHeight,
        });
      });
      y += this.rowHeight;
    });
  };
}
