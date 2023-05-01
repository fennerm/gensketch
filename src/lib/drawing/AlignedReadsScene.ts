import { Layer, Group as LayerGroup } from "@pixi/layers";
import { Viewport } from "pixi-viewport";
import * as PIXI from "pixi.js";

import type {
  AlignedPair,
  AlignedRead,
  AlignmentStackKind,
  Deletion,
  GenomicRegion,
  Insertion,
  PairedReads,
  SoftClip,
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
import { range } from "@lib/util";

const READ_BODY_POOL = "readBody";
const PAIR_LINE_POOL = "pairLine";
const FORWARD_READ_CAP_POOL = "forwardReadCap";
const REVERSE_READ_CAP_POOL = "reverseReadCap";
const DELETION_POOL = "deletion";
const DELETION_LABEL_POOL = "deletionLabel";
const DELETION_LABEL_MASK_POOL = "deletionLabelMask";
const INSERTION_POOL = "insertion";
const INSERTION_LABEL_POOL = "insertionLabel";
const NUC_RECT_SUFFIX = "SnvRect";
const NUC_TEXT_SUFFIX = "SnvText";
const DEFAULT_READ_HEIGHT = 10;
const DEFAULT_READ_WIDTH = 100;
const DEFAULT_NUC_WIDTH = 10;
const DEFAULT_CAP_WIDTH = DEFAULT_NUC_WIDTH;
const DEFAULT_PAIR_LINE_HEIGHT = 1;
const DEFAULT_DELETION_LINE_HEIGHT = 1;
const DEFAULT_DELETION_LABEL_MASK_WIDTH = 2 * DEFAULT_NUC_WIDTH;
const DEFAULT_INSERTION_WIDTH = 1;
const DEFAULT_PAIR_LINE_WIDTH = 100;
const DEFAULT_DELETION_WIDTH = DEFAULT_NUC_WIDTH;
const DEFAULT_DELETION_LABEL_FONTSIZE = 14;
const DEFAULT_INSERTION_LABEL_FONTSIZE = DEFAULT_DELETION_LABEL_FONTSIZE;
const DELETION_LABEL_PADDING = 2;
const INSERTION_LABEL_PADDING = 3;
// Character width as a fraction of the font size
const FONT_CHAR_WIDTH = 0.6;
const READ_HEIGHT = 20;
const ROW_SPACING = 2;
const ROW_HEIGHT = READ_HEIGHT + ROW_SPACING;

const MIN_DELETION_LENGTH_FOR_LABEL = 5;

export interface AlignedReadsTextures {
  forwardReadCap: PIXI.RenderTexture;
  reverseReadCap: PIXI.RenderTexture;
  insertion: PIXI.RenderTexture;
}

class TooltipField extends PIXI.Container {
  _spacing: number = 6;
  _keyStyle: PIXI.TextStyle;
  _valueStyle: PIXI.TextStyle;
  _key: PIXI.Text;
  _value: PIXI.Text;
  _layer: LayerGroup;

  constructor({
    key,
    keyStyle,
    valueStyle,
    layer,
  }: {
    key: string;
    readonly keyStyle: PIXI.TextStyle;
    readonly valueStyle: PIXI.TextStyle;
    readonly layer: LayerGroup;
  }) {
    super();
    this._keyStyle = keyStyle;
    this._valueStyle = valueStyle;
    this._layer = layer;
    this._key = new PIXI.Text(key + ":", this._keyStyle);
    this._value = new PIXI.Text("", valueStyle);
    this._value.position.set(this._key.width + this._spacing, 0);
    for (const obj of [this._key, this._value]) {
      obj.parentGroup = this._layer;
      obj.zOrder = 1;
      this.addChild(obj);
    }
  }
}

class AlignedReadTooltip extends PIXI.Container {
  _styles: StyleConfig;
  _numFields: number = 3;
  _hPad: number = 6;
  _vPad: number = 3;
  _lineHeight: number;
  _background: PIXI.Sprite;
  _keyStyle: PIXI.TextStyle;
  _valueStyle: PIXI.TextStyle;
  _readName: TooltipField;
  _coordinates: TooltipField;
  _cigar: TooltipField;
  _layer: LayerGroup;
  _maxFieldWidth: number;
  _fieldIndex: number;

  constructor({ styles, layer }: { readonly styles: StyleConfig; readonly layer: LayerGroup }) {
    super();
    this._styles = styles;
    this._layer = layer;
    this._lineHeight = this._styles.fonts.tooltipFontSize + 2;
    this._background = drawRect({
      color: styles.colors.background,
      dim: { width: 100, height: this._vPad * 2 + this._lineHeight * this._numFields },
      layer: layer,
    });
    this._background.zOrder = 0;
    this.addChild(this._background);
    this._keyStyle = new PIXI.TextStyle({
      fontSize: this._styles.fonts.tooltipFontSize,
      fontWeight: "bold",
    });
    this._valueStyle = new PIXI.TextStyle({ fontSize: this._styles.fonts.tooltipFontSize });
    this._fieldIndex = 0;
    this._maxFieldWidth = 0;
    this._readName = this.#initField("Name");
    this._coordinates = this.#initField("Coordinates");
    this._cigar = this.#initField("CIGAR");
  }

  #initField = (key: string): TooltipField => {
    const field = new TooltipField({
      key,
      keyStyle: this._keyStyle,
      valueStyle: this._valueStyle,
      layer: this._layer,
    });
    field.position.set(this._hPad, this._vPad + this._fieldIndex * this._lineHeight);
    this._fieldIndex++;
    this.addChild(field);
    return field;
  };

  #updateField(field: TooltipField, text: string): void {
    field._value.text = text;
    if (field.width > this._maxFieldWidth) {
      this._maxFieldWidth = field.width;
    }
  }

  setRead = (read: AlignedRead): void => {
    this._maxFieldWidth = 0;
    this.#updateField(this._readName, read.id);
    this.#updateField(this._coordinates, to1IndexedString(read.region));
    this.#updateField(this._cigar, read.cigarString);
    this._background.width = 2 * this._hPad + this._maxFieldWidth;
  };
}

export interface AlignedReadsSceneParams extends SceneParams {
  handleClick: () => void;
}
export interface AlignedReadsSceneState {
  alignments: AlignmentStackKind | null;
  focusedRegion: GenomicRegion | null;
  viewportWidth: number;
  viewportHeight: number;
}

// I considered breaking this up into multiple smaller container classes (e.g one for aligned read,
// one for aligned pair, etc) but it don't think that would play nice with our DrawPoolGroup
// implementation (since all sprites need to be drawn to the same container).
export class AlignedReadsScene extends Scene {
  viewport: Viewport;

  _handleClick: () => void;
  _drawPool: DrawPoolGroup;
  _bufferDim: Dimensions;
  _textures: AlignedReadsTextures;
  _focusedRegion: GenomicRegion | null;
  _alignments: AlignmentStackKind | null;
  _tooltip: AlignedReadTooltip;
  _focusedRegionLength: number;
  _bufferedRegionLength: number;
  _viewportOffset: Position;
  _nucWidth: number;
  _layers: LayerGroup[];
  _isDragging: boolean;

  constructor(params: AlignedReadsSceneParams) {
    super({ ...params, layered: true });
    this._handleClick = params.handleClick;
    this._bufferDim = { width: 3 * this._dim.width, height: 3 * this._dim.height };
    this.viewport = new Viewport({
      screenWidth: this._dim.width,
      screenHeight: this._dim.height,
      worldWidth: this._bufferDim.width,
      worldHeight: this._bufferDim.height,
      events: this.pixiApp.renderer.events,
    });
    this.pixiApp.stage.addChild(this.viewport);
    this.viewport.drag().pinch().decelerate().clamp({ direction: "all" });
    this.viewport.addEventListener("click", this._handleClick);
    this._layers = range(0, 8).map((i) => new LayerGroup(i, true));
    // The tooltip layer is on top and has nested layering
    this._layers[this._layers.length - 1].enableSort = true;
    this._layers.forEach((layer) => this.pixiApp.stage.addChild(new Layer(layer)));
    this._textures = this.#initTextures();
    this._drawPool = this.#initDrawPools();
    this._tooltip = this.#initTooltip();
    this._focusedRegion = null;
    this._alignments = null;
    this._viewportOffset = { x: 0, y: 0 };
    this._focusedRegionLength = 0;
    this._bufferedRegionLength = 0;
    this._nucWidth = 0;
    this._isDragging = false;
    document.addEventListener("mousedown", this.#handleMouseDown);
  }

  #dragHandler = (): void => {
    this._isDragging = true;
  };

  #handleMouseDown = (): void => {
    document.addEventListener("mousemove", this.#dragHandler);
    document.addEventListener("mouseup", this.#handleMouseUp);
  };

  #handleMouseUp = (): void => {
    document.removeEventListener("mousemove", this.#dragHandler);
    document.removeEventListener("mouseup", this.#handleMouseUp);
  };

  #initTooltip = (): AlignedReadTooltip => {
    const tooltip = new AlignedReadTooltip({ styles: this._styles, layer: this._layers[7] });
    tooltip.visible = false;
    this.viewport.addChild(tooltip);
    return tooltip;
  };

  destroy = () => {
    this.pixiApp.destroy();
    this._textures.forwardReadCap.destroy();
    this._textures.reverseReadCap.destroy();
    document.removeEventListener("mousedown", this.#handleMouseDown);
  };

  #initTriangleTexture = (): PIXI.RenderTexture => {
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
      forwardReadCap: this.#initTriangleTexture(),
      reverseReadCap: this.#initTriangleTexture(),
      insertion: this.#initTriangleTexture(),
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
    const insertionTemplate = drawTriangle({
      vertices: [
        { x: 0, y: 0 },
        { x: DEFAULT_INSERTION_WIDTH * DEFAULT_NUC_WIDTH, y: 0 },
        { x: (DEFAULT_INSERTION_WIDTH * DEFAULT_NUC_WIDTH) / 2, y: DEFAULT_READ_HEIGHT },
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
    this.pixiApp.loadRenderTexture({
      shape: insertionTemplate,
      texture: textures.insertion,
    });

    // Required for MSAA, WebGL 2 only
    this.pixiApp.renderer.framebuffer.blit();
    return textures;
  };

  #drawReadCap = ({
    texture,
    pos = { x: 0, y: 0 },
    dim = { width: DEFAULT_CAP_WIDTH, height: DEFAULT_READ_HEIGHT },
    color,
    layer,
  }: {
    texture: PIXI.RenderTexture;
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    const cap = new PIXI.Sprite(texture);
    // TODO double check if this setTransform is necessary
    cap.setTransform();
    updateIfChanged({ container: cap, pos, dim, layer, color, interactive: true });
    return cap;
  };

  #drawInsertion = ({
    pos = { x: 0, y: 0 },
    dim = { width: DEFAULT_INSERTION_WIDTH, height: DEFAULT_READ_HEIGHT },
    color,
    layer,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    const insertion = new PIXI.Sprite(this._textures.insertion);
    // TODO double check if this setTransform is necessary
    insertion.setTransform();
    updateIfChanged({ container: insertion, pos, dim, layer, color });
    return insertion;
  };

  #drawForwardReadCap = ({
    pos,
    dim,
    color,
    layer,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    return this.#drawReadCap({ texture: this._textures.forwardReadCap, pos, dim, color, layer });
  };

  #drawReverseReadCap = ({
    pos,
    dim,
    color,
    layer,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    return this.#drawReadCap({ texture: this._textures.reverseReadCap, pos, dim, color, layer });
  };

  #drawDeletion = ({
    pos,
    dim = { width: DEFAULT_DELETION_WIDTH, height: DEFAULT_READ_HEIGHT },
    color,
    backgroundLayer,
    lineLayer,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
    backgroundLayer?: LayerGroup;
    lineLayer?: LayerGroup;
  }): PIXI.Container => {
    const container = new PIXI.Container();
    const background = drawRect({
      color: this._styles.colors.background,
      dim,
      layer: backgroundLayer,
    });
    const line = drawRect({
      color,
      pos: { x: 0, y: dim.height / 2 - DEFAULT_DELETION_LINE_HEIGHT / 2 },
      dim: { width: dim.width, height: DEFAULT_DELETION_LINE_HEIGHT },
      layer: lineLayer,
    });
    container.addChild(background);
    container.addChild(line);
    updateIfChanged({ container, pos, dim });
    return container;
  };

  #initDrawPools = (): DrawPoolGroup => {
    const drawConfig: DrawConfig = {};
    const alignmentColor = this._styles.colors.alignment;
    drawConfig[PAIR_LINE_POOL] = {
      drawFn: () =>
        drawRect({
          color: 0x000000,
          dim: { width: DEFAULT_PAIR_LINE_WIDTH, height: DEFAULT_PAIR_LINE_HEIGHT },
          layer: this._layers[0],
        }),
      poolsize: 500,
    };
    drawConfig[READ_BODY_POOL] = {
      drawFn: () =>
        drawRect({
          color: alignmentColor,
          interactive: true,
          dim: { width: DEFAULT_READ_WIDTH, height: DEFAULT_READ_HEIGHT },
          layer: this._layers[1],
        }),
      poolsize: 500,
    };
    drawConfig[FORWARD_READ_CAP_POOL] = {
      drawFn: () => this.#drawForwardReadCap({ color: alignmentColor, layer: this._layers[1] }),
      poolsize: 250,
    };
    drawConfig[REVERSE_READ_CAP_POOL] = {
      drawFn: () => this.#drawReverseReadCap({ color: alignmentColor, layer: this._layers[1] }),
      poolsize: 250,
    };

    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = this._styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: DEFAULT_NUC_WIDTH, height: DEFAULT_READ_HEIGHT },
            layer: this._layers[2],
          }),
        poolsize: 200,
      };
      drawConfig[nuc + NUC_TEXT_SUFFIX] = {
        drawFn: () => drawText({ text: nuc, style: { tint: nucColor }, layer: this._layers[2] }),
        poolsize: 50,
      };
    });
    SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = this._styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: DEFAULT_NUC_WIDTH, height: DEFAULT_READ_HEIGHT },
            layer: this._layers[2],
          }),
        poolsize: 5,
      };
      drawConfig[nuc + NUC_TEXT_SUFFIX] = {
        drawFn: () => drawText({ text: nuc, style: { tint: nucColor }, layer: this._layers[2] }),
        poolsize: 5,
      };
    });
    drawConfig[DELETION_POOL] = {
      drawFn: () =>
        this.#drawDeletion({
          backgroundLayer: this._layers[3],
          lineLayer: this._layers[4],
          color: this._styles.colors.deletion,
        }),
      poolsize: 100,
    };
    drawConfig[INSERTION_POOL] = {
      drawFn: () =>
        this.#drawInsertion({
          color: this._styles.colors.insertion,
          layer: this._layers[3],
          dim: { width: DEFAULT_INSERTION_WIDTH * DEFAULT_NUC_WIDTH, height: DEFAULT_READ_HEIGHT },
        }),
      poolsize: 100,
    };
    drawConfig[INSERTION_LABEL_POOL] = {
      drawFn: () =>
        drawText({
          text: "1",
          layer: this._layers[4],
          style: {
            fontSize: DEFAULT_INSERTION_LABEL_FONTSIZE,
            tint: this._styles.colors.background,
          },
        }),
      poolsize: 100,
    };
    drawConfig[DELETION_LABEL_MASK_POOL] = {
      drawFn: () =>
        drawRect({
          color: this._styles.colors.background,
          dim: { width: DEFAULT_DELETION_LABEL_MASK_WIDTH, height: DEFAULT_READ_HEIGHT },
          layer: this._layers[5],
        }),
      poolsize: 50,
    };
    drawConfig[DELETION_LABEL_POOL] = {
      drawFn: () =>
        drawText({
          text: String(MIN_DELETION_LENGTH_FOR_LABEL),
          style: { fontSize: DEFAULT_DELETION_LABEL_FONTSIZE, tint: this._styles.colors.deletion },
          layer: this._layers[6],
        }),
    };
    return new DrawPoolGroup({ drawConfig, stage: this.viewport });
  };

  #displayPairLine = ({
    pos,
    alignment,
  }: {
    readonly pos: Position;
    readonly alignment: PairedReads;
  }): void => {
    const linePos = { x: pos.x, y: pos.y + READ_HEIGHT / 2 };
    const dim = {
      width: Number(alignment.interval.end - alignment.interval.start) * this._nucWidth,
      height: 0.5,
    };
    this._drawPool.draw(PAIR_LINE_POOL, { pos: linePos, dim });
  };

  #displayMismatch = ({ nuc, pos }: { nuc: string; pos: Position }): void => {
    nuc = nuc !== "-" ? nuc : "GAP";
    if (this._nucWidth > DRAW_LETTER_THRESHOLD) {
      this._drawPool.draw(nuc + NUC_TEXT_SUFFIX, {
        pos,
        fontSize: READ_HEIGHT - 2,
      });
    } else {
      this._drawPool.draw(nuc + NUC_RECT_SUFFIX, {
        pos,
        dim: { width: this._nucWidth, height: READ_HEIGHT },
      });
    }
  };

  #displayDeletion = ({ diff, pos }: { diff: Deletion; pos: Position }): void => {
    this._drawPool.draw(DELETION_POOL, {
      pos,
      dim: { width: this._nucWidth * Number(getLength(diff.interval)), height: READ_HEIGHT },
    });
    const deletionLength = Number(getLength(diff.interval));
    if (deletionLength < MIN_DELETION_LENGTH_FOR_LABEL) {
      return;
    }

    const labelText = String(deletionLength);
    const fontSize = READ_HEIGHT - 2;
    const charWidth = FONT_CHAR_WIDTH * fontSize;
    const deletionPxWidth = deletionLength * this._nucWidth;
    const labelPxWidth = charWidth * labelText.length;
    const labelPos = {
      x: pos.x + deletionPxWidth / 2 - labelPxWidth / 2 - DELETION_LABEL_PADDING,
      y: pos.y,
    };
    this._drawPool.draw(DELETION_LABEL_MASK_POOL, {
      pos: labelPos,
      dim: { width: labelPxWidth + 2 * DELETION_LABEL_PADDING, height: READ_HEIGHT },
    });
    this._drawPool.draw(DELETION_LABEL_POOL, {
      text: labelText,
      pos: { x: labelPos.x + DELETION_LABEL_PADDING, y: labelPos.y },
      fontSize,
    });
  };

  // Note that `pos` is the center of the insertion (not the left edge as with other variant types)
  #displayInsertion = ({ diff, pos }: { diff: Insertion; pos: Position }): void => {
    const insertionLength = diff.sequence.length;
    const labelText = insertionLength == 1 ? diff.sequence : String(insertionLength);
    const fontSize = READ_HEIGHT - 4;
    const width = FONT_CHAR_WIDTH * fontSize * labelText.length + 2 * INSERTION_LABEL_PADDING;
    const x = pos.x - width / 2;
    this._drawPool.draw(INSERTION_POOL, {
      pos: { x, y: pos.y },
      dim: { width, height: READ_HEIGHT },
    });
    this._drawPool.draw(INSERTION_LABEL_POOL, {
      text: labelText,
      pos: { x: x + INSERTION_LABEL_PADDING, y: pos.y - 2 },
      fontSize,
    });
  };

  #displaySoftClip = ({ diff, pos }: { diff: SoftClip; pos: Position }): void => {
    range(diff.interval.start, diff.interval.end).forEach((basePos) => {
      const x = Number(basePos - this._focusedRegion!.interval.start) * this._nucWidth;
      const nuc = diff.sequence[Number(basePos - diff.interval.start)];
      this.#displayMismatch({ nuc, pos: { x, y: pos.y } });
    });
  };

  #displayDiffs = ({ read, pos }: { readonly read: AlignedRead; readonly pos: Position }): void => {
    read.diffs.forEach((diff) => {
      const diffX =
        Number(diff.interval.start - this._focusedRegion!.interval.start) * this._nucWidth;
      switch (diff.type) {
        case "mismatch": {
          this.#displayMismatch({ nuc: diff.sequence, pos: { x: diffX, y: pos.y } });
          break;
        }
        case "ins":
          this.#displayInsertion({ diff, pos: { x: diffX, y: pos.y } });
          break;
        case "del":
          this.#displayDeletion({ diff, pos: { x: diffX, y: pos.y } });
          break;
        case "softClip":
          this.#displaySoftClip({ diff, pos: { x: diffX, y: pos.y } });
          break;
      }
    });
  };

  #displayTooltip = ({ read, pos }: { readonly read: AlignedRead; pos: Position }) => {
    // TODO fix tooltip positioning when fields are wide. Perhaps only happening in wayland
    this._tooltip.setRead(read);
    this._tooltip.x = pos.x;
    this._tooltip.y = pos.y;
    if (
      pos.x - this._viewportOffset.x + this._tooltip.width + 5 >
      this.canvas.offsetLeft + this.canvas.offsetWidth
    ) {
      this._tooltip.x -= this._tooltip.width;
    }
    if (pos.y + this._tooltip.height + 5 > this.canvas.offsetTop + this.canvas.offsetHeight) {
      this._tooltip.y -= this._tooltip.height;
    }
    this._tooltip.visible = true;
    this.viewport.addChild(this._tooltip);
  };

  #destroyTooltip = (): void => {
    this._tooltip.visible = false;
  };

  #displayRead = ({ read, pos }: { readonly read: AlignedRead; readonly pos: Position }): void => {
    const width = Number(read.region.interval.end - read.region.interval.start) * this._nucWidth;

    const onMouseOver = (event: PIXI.FederatedPointerEvent): void => {
      if (!this._isDragging) {
        this.#displayTooltip({
          read,
          pos: {
            x: event.globalX + this._viewportOffset.x,
            y: event.globalY,
          },
        });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onMouseOut = (event: PIXI.FederatedPointerEvent): void => {
      this.#destroyTooltip();
    };

    const capWidth = 5;
    if (read.isReverse) {
      this._drawPool.draw(REVERSE_READ_CAP_POOL, {
        pos: { x: pos.x - capWidth, y: pos.y },
        dim: { width: capWidth, height: READ_HEIGHT },
        onMouseOver,
        onMouseOut,
      });
    } else {
      this._drawPool.draw(FORWARD_READ_CAP_POOL, {
        pos: { x: pos.x + width - 1, y: pos.y },
        dim: { width: capWidth, height: READ_HEIGHT },
        onMouseOver,
        onMouseOut,
      });
    }

    this._drawPool.draw(READ_BODY_POOL, {
      pos,
      dim: { width, height: READ_HEIGHT },
      onMouseOver,
      onMouseOut,
    });
    this.#displayDiffs({ read, pos });
  };

  #displayAlignment = ({
    alignment,
    pos,
  }: {
    readonly alignment: AlignedPair;
    readonly pos: Position;
  }): void => {
    let reads;
    if (alignment.type == "pairedReadsKind") {
      reads = [alignment.read1, alignment.read2];
      this.#displayPairLine({ pos, alignment });
    } else {
      reads = [alignment.read];
    }
    reads.forEach((read) => {
      if (read === null) {
        return;
      }
      let readX =
        pos.x + Number(read.region.interval.start - alignment.interval.start) * this._nucWidth;
      if (readX < 0) {
        readX = 0;
      }
      try {
        this.#displayRead({ read, pos: { x: readX, y: pos.y } });
      } catch (error) {
        LOG.warn(String(error));
        LOG.warn(JSON.stringify(read));
      }
    });
  };

  setState = ({
    alignments = this._alignments,
    focusedRegion = this._focusedRegion,
    viewportWidth = this._dim.width,
    viewportHeight = this._dim.height,
  }: Partial<AlignedReadsSceneState>): void => {
    // TODO set interactiveChildren to false on most elements to improve performance
    this._alignments = alignments;
    this._focusedRegion = focusedRegion;
    if (this._alignments === null || this._focusedRegion === null) {
      return;
    }
    if (
      focusedRegion !== this._focusedRegion ||
      viewportWidth !== this._dim.width ||
      viewportHeight !== this._dim.height
    ) {
      this.#destroyTooltip();
    }

    this.resize({ width: viewportWidth, height: viewportHeight });
    this._focusedRegionLength = Number(getLength(this._focusedRegion.interval));
    this._bufferedRegionLength = Number(getLength(this._alignments.bufferedRegion.interval));
    this._nucWidth = this._dim.width / this._focusedRegionLength;
    this._bufferDim = {
      width: Math.round(this._nucWidth * this._bufferedRegionLength),
      height: Math.round(ROW_HEIGHT * this._alignments.rows.length),
    };
    this.viewport.resize(
      this._dim.width,
      this._dim.height,
      this._bufferDim.width,
      this._bufferDim.height
    );

    this._viewportOffset = {
      x:
        Number(
          this._focusedRegion.interval.start - this._alignments.bufferedRegion.interval.start
        ) * this._nucWidth,
      y: this._viewportOffset.y,
    };
    this.viewport.moveCorner(this._viewportOffset.x, this._viewportOffset.y);
  };

  scroll = (delta: number): void => {
    let y = this._viewportOffset.y + delta * this._bufferDim.height;
    const maxY = this._bufferDim.height - this._dim.height;
    if (y < 0) {
      y = 0;
    } else if (y > maxY) {
      y = maxY;
    }
    this._viewportOffset = {
      x: this._viewportOffset.x,
      y,
    };
    this.viewport.moveCorner(this._viewportOffset.x, this._viewportOffset.y);
  };

  draw = () => {
    if (this._alignments === null || this._focusedRegion === null) {
      LOG.warn("Attempted to draw AlignedReadsScene with uninitialized state");
      return;
    }
    this.clear();
    this.#destroyTooltip();

    LOG.debug(
      `Redrawing AlignmentsView with nucWidth=${this._nucWidth}, regionLength=${
        this._focusedRegionLength
      }, numRows=${this._alignments.rows.length}, region=${JSON.stringify(
        this._focusedRegion
      )}, width=${this._dim.width}, height=${this._dim.height}, bufferWidth=${
        this._bufferDim.width
      }, bufferHeight=${this._bufferDim.height}`
    );
    let y = 0;
    this._alignments.rows.forEach((row) => {
      row.forEach((alignment) => {
        const x =
          Number(BigInt(alignment.interval.start) - this._focusedRegion!.interval.start) *
          this._nucWidth;
        this.#displayAlignment({
          alignment,
          pos: { x, y },
        });
      });
      y += ROW_HEIGHT;
    });
  };
}
