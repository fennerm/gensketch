/**
 * Drawing aligned reads with pixi.js.
 */
import { zip } from "lodash-es";
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
} from "@lib/bindings";
import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "@lib/constants";
import { Scene } from "@lib/drawing/Scene";
import type { SceneParams } from "@lib/drawing/Scene";
import {
  DRAW_LETTER_THRESHOLD,
  type DrawPoolConfig,
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

// Names for items in the draw pool
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

// Default dimensions in pixels
const DEFAULT_READ_WIDTH = 100;
const DEFAULT_NUC_WIDTH = 10;
const CAP_WIDTH = 5;
const DEFAULT_PAIR_LINE_HEIGHT = 0.5;
const DEFAULT_DELETION_LINE_HEIGHT = 1;
const DEFAULT_DELETION_LABEL_MASK_WIDTH = 2 * DEFAULT_NUC_WIDTH;
const DEFAULT_INSERTION_WIDTH = 1;
const DEFAULT_PAIR_LINE_WIDTH = 100;
const DEFAULT_DELETION_WIDTH = DEFAULT_NUC_WIDTH;
const DELETION_LABEL_PADDING = 2;
const INSERTION_LABEL_PADDING = 3;
const READ_HEIGHT = 20;
const MISMATCH_FONTSIZE = READ_HEIGHT - 2;
const DELETION_FONTSIZE = MISMATCH_FONTSIZE;
const INSERTION_FONTSIZE = READ_HEIGHT - 4;

const DEFAULT_DELETION_LABEL_FONTSIZE = 14;
const DEFAULT_INSERTION_LABEL_FONTSIZE = DEFAULT_DELETION_LABEL_FONTSIZE;

// Character width as a fraction of the font size
const FONT_CHAR_WIDTH = 0.6;

// Vertical spacing between reads in pixels
const ROW_SPACING = 2;
const ROW_HEIGHT = READ_HEIGHT + ROW_SPACING;

// Minimum length that a deletion needs to be in order to include a label with deletion length
const MIN_DELETION_LENGTH_FOR_LABEL = 5;

const TOOLTIP_FIELD_NAME = "Name";
const TOOLTIP_FIELD_COORDINATES = "Coordinates";
const TOOLTIP_FIELD_CIGAR = "CIGAR";
const TOOLTIP_FIELDS = [TOOLTIP_FIELD_NAME, TOOLTIP_FIELD_COORDINATES, TOOLTIP_FIELD_CIGAR];
const TOOLTIP_HPAD = 6;
const TOOLTIP_VPAD = 3;
// If a tooltip edge would be within this many pixels of the screen edge, flip it to the other side
// of the mouse.
const TOOLTIP_SCREEN_EDGE_PADDING = 5;

/**
 * Textures used in the scene.
 */
export interface AlignedReadsTextures {
  forwardReadCap: PIXI.RenderTexture;
  reverseReadCap: PIXI.RenderTexture;
  insertion: PIXI.RenderTexture;
}

/**
 * A single field name/value pair to be displayed in the hover tooltip.
 */
class TooltipField extends PIXI.Container {
  // Horizontal spacing between the key and value in pixels
  _spacing: number = 6;

  // Text style for the field name
  _keyStyle: PIXI.TextStyle;

  // Text style for the field value
  _valueStyle: PIXI.TextStyle;

  // Field name
  _key: PIXI.Text;

  // Field value
  _value: PIXI.Text;

  // Layer group (z-index) to display the field
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

/**
 * Tooltip displayed when the user hovers over an aligned read.
 */
class AlignedReadTooltip extends PIXI.Container {
  _numFields: number = 3;
  _fontSize: number;
  _background: PIXI.Sprite;
  _keyStyle: PIXI.TextStyle;
  _valueStyle: PIXI.TextStyle;
  _fields: Map<string, TooltipField>;
  _layer: LayerGroup;
  _maxFieldWidth: number;

  constructor({
    fontSize,
    backgroundColor,
    layer,
  }: {
    fontSize: number;
    backgroundColor: number;
    readonly layer: LayerGroup;
  }) {
    super();
    this._layer = layer;
    this._fontSize = fontSize;
    this._background = this._initBackground(backgroundColor);
    this._keyStyle = new PIXI.TextStyle({
      fontSize,
      fontWeight: "bold",
    });
    this._valueStyle = new PIXI.TextStyle({ fontSize });
    this._maxFieldWidth = 0;
    this._fields = this._initFields();
  }

  get _lineHeight(): number {
    return this._fontSize + 2;
  }

  /** Initialize the background bounding box for the tooltip. */
  _initBackground = (color: number): PIXI.Sprite => {
    const background = drawRect({
      color,
      dim: { width: 100, height: TOOLTIP_VPAD * 2 + this._lineHeight * TOOLTIP_FIELDS.length },
      layer: this._layer,
    });
    background.zOrder = 0;
    this.addChild(background);
    return background;
  };

  /** Initialize the tooltip fields (with no values). */
  _initFields = (): Map<string, TooltipField> => {
    let fieldIndex = 0;
    const fields = new Map();

    TOOLTIP_FIELDS.map((fieldName) => {
      const field = new TooltipField({
        key: fieldName,
        keyStyle: this._keyStyle,
        valueStyle: this._valueStyle,
        layer: this._layer,
      });
      field.position.set(TOOLTIP_HPAD, TOOLTIP_VPAD + fieldIndex * this._lineHeight);
      fieldIndex++;
      this.addChild(field);
      fields.set(fieldName, field);
    });
    return fields;
  };

  /** Update a tooltip field with a new value. */
  _updateField(fieldName: string, value: string): void {
    const field = this._fields.get(fieldName);
    if (field === undefined) {
      throw new Error(`Invalid field name: ${fieldName}`);
    }
    field._value.text = value;
    if (field.width > this._maxFieldWidth) {
      this._maxFieldWidth = field.width;
    }
  }

  /** Update the read info which will be displayed. */
  setRead = (read: AlignedRead): void => {
    this._maxFieldWidth = 0;
    this._updateField(TOOLTIP_FIELD_NAME, read.id);
    this._updateField(TOOLTIP_FIELD_COORDINATES, to1IndexedString(read.region));
    this._updateField(TOOLTIP_FIELD_CIGAR, read.cigarString);
    this._background.width = 2 * TOOLTIP_HPAD + this._maxFieldWidth;
  };
}

export interface AlignedReadsSceneParams extends SceneParams {
  handleClick: () => void;
}

/** The scene is a state machine based on these attributes. */
export interface AlignedReadsSceneState {
  alignments: AlignmentStackKind | null;
  focusedRegion: GenomicRegion | null;
  viewportWidth: number;
  viewportHeight: number;
}

/** The aligned reads scene is responsible for rendering aligned reads (from e.g BAM files).
 *
 * It holds a PIXI application and a viewport which the application renders to. The scene only
 * displays reads in the currently focused region but it actually renders a larger (buffered) region
 * to allow for smooth scrolling.
 *
 * @public viewport The PIXI container which the scene renders to.
 */
export class AlignedReadsScene extends Scene {
  // I considered breaking this up into multiple smaller container classes (e.g one for aligned read,
  // one for aligned pair, etc) but it don't think that would play nice with our DrawPoolGroup
  // implementation (since all sprites need to be drawn to the same container).
  viewport: Viewport;

  // Called when the user clicks anywhere in the scene.
  _handleClick: () => void;

  // Pools of pre-rendered sprites for drawing to the scene
  _drawPool: DrawPoolGroup;

  // Dimensions of the larger buffered region around the focused region
  _bufferDim: Dimensions;

  // Textures used in the scene
  _textures: Map<string, PIXI.RenderTexture>;

  // Genomic coordinates for the region which is currently being displayed
  _focusedRegion: GenomicRegion | null;

  // Alignment objects which are being displayed. May be paired or unpaired reads.
  _alignments: AlignmentStackKind | null;

  // Tooltip which is displayed when the user hovers over an aligned read
  _tooltip: AlignedReadTooltip;

  // Offset of the viewport from the top left corner of the buffered region
  _viewportOffset: Position;

  // Width of a single nucleotide in the current viewport
  _nucWidth: number;

  // Layers used in the scene (defines z-order)
  _layers: LayerGroup[];

  // True if the user is currently dragging any element on the page (not just in the scene)
  _isDragging: boolean;

  constructor(params: AlignedReadsSceneParams) {
    super({ ...params, layered: true });
    this._handleClick = params.handleClick;
    this._bufferDim = { width: 3 * this._dim.width, height: 3 * this._dim.height };
    this.viewport = this._initViewport();
    this._layers = this._initLayers();
    this._textures = this._initTextures();
    this._drawPool = this._initDrawPools();
    this._tooltip = this._initTooltip();
    this._focusedRegion = null;
    this._alignments = null;
    this._viewportOffset = { x: 0, y: 0 };
    this._nucWidth = 0;
    this._isDragging = false;
    document.addEventListener("mousedown", this._handleMouseDown);
  }

  /**
   * Initialize the z-layers used in the scene.
   */
  _initLayers = (): LayerGroup[] => {
    const layers = range(0, 8).map((i) => new LayerGroup(i, true));
    // The tooltip layer is on top and has nested layering
    layers[layers.length - 1].enableSort = true;
    layers.forEach((layer) => this.pixiApp.stage.addChild(new Layer(layer)));
    return layers;
  };

  _initViewport = (): Viewport => {
    const viewport = new Viewport({
      screenWidth: this._dim.width,
      screenHeight: this._dim.height,
      worldWidth: this._bufferDim.width,
      worldHeight: this._bufferDim.height,
      events: this.pixiApp.renderer.events,
    });
    this.pixiApp.stage.addChild(viewport);
    viewport.drag({ direction: "y" }).clamp({ direction: "all" });
    viewport.addEventListener("click", this._handleClick);
    return viewport;
  };

  get _focusedRegionLength(): number | null {
    if (this._focusedRegion === null) {
      return null;
    }
    return Number(getLength(this._focusedRegion));
  }

  get _bufferedRegionLength(): number | null {
    if (this._alignments === null) {
      return null;
    }
    return Number(getLength(this._alignments.bufferedRegion));
  }

  /**
   * Called when the user is dragging their mouse.
   */
  _dragHandler = (): void => {
    this._isDragging = true;
  };

  _handleMouseDown = (): void => {
    document.addEventListener("mousemove", this._dragHandler);
    document.addEventListener("mouseup", this._handleMouseUp);
  };

  _handleMouseUp = (): void => {
    document.removeEventListener("mousemove", this._dragHandler);
    document.removeEventListener("mouseup", this._handleMouseUp);
  };

  /**
   * Initialize the tooltip displayed when the user hovers over an aligned read.
   */
  _initTooltip = (): AlignedReadTooltip => {
    const tooltip = new AlignedReadTooltip({
      fontSize: this._styles.fonts.tooltipFontSize,
      backgroundColor: this._styles.colors.background,
      layer: this._layers[7],
    });
    tooltip.visible = false;
    this.viewport.addChild(tooltip);
    return tooltip;
  };

  _initRenderTexture = (): PIXI.RenderTexture => {
    const texture = PIXI.RenderTexture.create({
      width: CAP_WIDTH,
      height: READ_HEIGHT,
      multisample: PIXI.MSAA_QUALITY.HIGH,
      resolution: window.devicePixelRatio,
    });
    return texture;
  };

  _initTextures = (): Map<string, PIXI.RenderTexture> => {
    const textures = new Map([
      ["forwardReadCap", this._initRenderTexture()],
      ["reverseReadCap", this._initRenderTexture()],
      ["insertion", this._initRenderTexture()],
    ]);

    const forwardReadCapTemplate = drawTriangle({
      vertices: [
        { x: 0, y: 0 },
        { x: CAP_WIDTH, y: READ_HEIGHT / 2 },
        { x: 0, y: READ_HEIGHT },
      ],
      color: 0xffffff,
    });
    const reverseReadCapTemplate = drawTriangle({
      vertices: [
        { x: CAP_WIDTH, y: 0 },
        { x: CAP_WIDTH, y: READ_HEIGHT },
        { x: 0, y: READ_HEIGHT / 2 },
      ],
      color: 0xffffff,
    });
    const insertionTemplate = drawTriangle({
      vertices: [
        { x: 0, y: 0 },
        { x: DEFAULT_INSERTION_WIDTH * DEFAULT_NUC_WIDTH, y: 0 },
        { x: (DEFAULT_INSERTION_WIDTH * DEFAULT_NUC_WIDTH) / 2, y: READ_HEIGHT },
      ],
      color: 0xffffff,
    });

    zip<PIXI.Graphics, PIXI.RenderTexture>(
      [forwardReadCapTemplate, reverseReadCapTemplate, insertionTemplate],
      Array.from(textures.values())
    ).forEach(([template, texture]) => {
      this.pixiApp.loadRenderTexture({
        shape: template!,
        texture: texture!,
      });
    });

    // Required for MSAA, WebGL 2 only
    this.pixiApp.renderer.framebuffer.blit();
    return textures;
  };

  /**
   * Draw sprite for the triangle at the end of the read which indicates its direction.
   */
  _drawReadCap = ({
    texture,
    pos = { x: 0, y: 0 },
    width = CAP_WIDTH,
    color,
    layer,
  }: {
    texture: PIXI.RenderTexture;
    readonly pos?: Position;
    width?: number;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    const cap = new PIXI.Sprite(texture);
    updateIfChanged({
      container: cap,
      pos,
      dim: { width, height: READ_HEIGHT },
      layer,
      color,
      interactive: true,
    });
    return cap;
  };

  _drawInsertion = ({
    pos = { x: 0, y: 0 },
    width = DEFAULT_INSERTION_WIDTH,
    color,
    layer,
  }: {
    readonly pos?: Position;
    width?: number;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    const insertion = new PIXI.Sprite(this._textures.get("insertion")!);
    updateIfChanged({
      container: insertion,
      pos,
      dim: { width, height: READ_HEIGHT },
      layer,
      color,
    });
    return insertion;
  };

  _drawForwardReadCap = ({
    pos,
    width = CAP_WIDTH,
    color,
    layer,
  }: {
    readonly pos?: Position;
    width?: number;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    return this._drawReadCap({
      texture: this._textures.get("forwardReadCap")!,
      pos,
      width,
      color,
      layer,
    });
  };

  _drawReverseReadCap = ({
    pos,
    width = CAP_WIDTH,
    color,
    layer,
  }: {
    readonly pos?: Position;
    width?: number;
    color?: number;
    layer?: LayerGroup;
  }): PIXI.Sprite => {
    return this._drawReadCap({
      texture: this._textures.get("reverseReadCap")!,
      pos,
      width,
      color,
      layer,
    });
  };

  _drawDeletion = ({
    pos,
    width = DEFAULT_DELETION_WIDTH,
    color,
    backgroundLayer,
    lineLayer,
  }: {
    readonly pos?: Position;
    width?: number;
    color?: number;
    backgroundLayer?: LayerGroup;
    lineLayer?: LayerGroup;
  }): PIXI.Container => {
    const container = new PIXI.Container();
    const background = drawRect({
      color: this._styles.colors.background,
      dim: { width, height: READ_HEIGHT },
      layer: backgroundLayer,
    });
    const line = drawRect({
      color,
      pos: { x: 0, y: READ_HEIGHT / 2 - DEFAULT_DELETION_LINE_HEIGHT / 2 },
      dim: { width, height: DEFAULT_DELETION_LINE_HEIGHT },
      layer: lineLayer,
    });
    container.addChild(background);
    container.addChild(line);
    updateIfChanged({ container, pos, dim: { width, height: READ_HEIGHT } });
    return container;
  };

  _initDrawPools = (): DrawPoolGroup => {
    const drawConfig: DrawPoolConfig = {};
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
          dim: { width: DEFAULT_READ_WIDTH, height: READ_HEIGHT },
          layer: this._layers[1],
        }),
      poolsize: 500,
    };
    drawConfig[FORWARD_READ_CAP_POOL] = {
      drawFn: () => this._drawForwardReadCap({ color: alignmentColor, layer: this._layers[1] }),
      poolsize: 250,
    };
    drawConfig[REVERSE_READ_CAP_POOL] = {
      drawFn: () => this._drawReverseReadCap({ color: alignmentColor, layer: this._layers[1] }),
      poolsize: 250,
    };

    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = this._styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + NUC_RECT_SUFFIX] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: DEFAULT_NUC_WIDTH, height: READ_HEIGHT },
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
            dim: { width: DEFAULT_NUC_WIDTH, height: READ_HEIGHT },
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
        this._drawDeletion({
          backgroundLayer: this._layers[3],
          lineLayer: this._layers[4],
          color: this._styles.colors.deletion,
        }),
      poolsize: 100,
    };
    drawConfig[INSERTION_POOL] = {
      drawFn: () =>
        this._drawInsertion({
          color: this._styles.colors.insertion,
          layer: this._layers[3],
          width: DEFAULT_INSERTION_WIDTH,
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
          dim: { width: DEFAULT_DELETION_LABEL_MASK_WIDTH, height: READ_HEIGHT },
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

  /**
   * Render a line connecting two paired reads.
   */
  _displayPairLine = ({
    pos,
    alignment,
  }: {
    readonly pos: Position;
    readonly alignment: PairedReads;
  }): void => {
    const linePos = { x: pos.x, y: pos.y + READ_HEIGHT / 2 };
    const dim = {
      width: Number(getLength(alignment.interval)) * this._nucWidth,
      height: DEFAULT_PAIR_LINE_HEIGHT,
    };
    this._drawPool.draw(PAIR_LINE_POOL, { pos: linePos, dim });
  };

  /**
   * Render a single nucleotide mismatch.
   * @param nuc - The SNV/SNP nucleotide.
   */
  _displayMismatch = ({ nuc, pos }: { nuc: string; pos: Position }): void => {
    // TODO Render GAPs properly.
    nuc = nuc !== "-" ? nuc : "GAP";
    if (this._nucWidth > DRAW_LETTER_THRESHOLD) {
      this._drawPool.draw(nuc + NUC_TEXT_SUFFIX, {
        pos,
        fontSize: MISMATCH_FONTSIZE,
      });
    } else {
      this._drawPool.draw(nuc + NUC_RECT_SUFFIX, {
        pos,
        dim: { width: this._nucWidth, height: READ_HEIGHT },
      });
    }
  };

  /**
   * Render a label on a deletion variant describing the length.
   * @param length - The deletion length in nucleotides.
   */
  _displayDeletionLabel = ({ pos, length }: { pos: Position; length: number }): void => {
    const labelText = String(length);
    const charWidth = FONT_CHAR_WIDTH * DELETION_FONTSIZE;
    const deletionPxWidth = length * this._nucWidth;
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
      fontSize: DELETION_FONTSIZE,
    });
  };

  /**
   * Render a deletion variant.
   */
  _displayDeletion = ({ diff, pos }: { diff: Deletion; pos: Position }): void => {
    this._drawPool.draw(DELETION_POOL, {
      pos,
      dim: { width: this._nucWidth * Number(getLength(diff.interval)), height: READ_HEIGHT },
    });
    const length = Number(getLength(diff.interval));
    if (length < MIN_DELETION_LENGTH_FOR_LABEL) {
      return;
    }
    this._displayDeletionLabel({ pos, length });
  };

  /**
   * Render an insertion variant.
   *
   * @param pos - The position of the center of the insertion (not the left edge as with other
   *  variant types)
   */
  _displayInsertion = ({ diff, pos }: { diff: Insertion; pos: Position }): void => {
    // TODO - Insertions being truncated in wayland
    const insertionLength = diff.sequence.length;
    const labelText = insertionLength == 1 ? diff.sequence : String(insertionLength);
    const width =
      FONT_CHAR_WIDTH * INSERTION_FONTSIZE * labelText.length + 2 * INSERTION_LABEL_PADDING;
    const x = pos.x - width / 2;
    this._drawPool.draw(INSERTION_POOL, {
      pos: { x, y: pos.y },
      dim: { width, height: READ_HEIGHT },
    });
    this._drawPool.draw(INSERTION_LABEL_POOL, {
      text: labelText,
      pos: { x: x + INSERTION_LABEL_PADDING, y: pos.y - 2 },
      fontSize: INSERTION_FONTSIZE,
    });
  };

  /**
   * Render one or more softclipped bases.
   */
  _displaySoftClip = ({ diff, pos }: { diff: SoftClip; pos: Position }): void => {
    range(diff.interval.start, diff.interval.end).forEach((basePos) => {
      const x = Number(basePos - this._focusedRegion!.interval.start) * this._nucWidth;
      const nuc = diff.sequence[Number(basePos - diff.interval.start)];
      this._displayMismatch({ nuc, pos: { x, y: pos.y } });
    });
  };

  /**
   * Render all variants in an aligned read.
   */
  _displayDiffs = ({ read, pos }: { readonly read: AlignedRead; readonly pos: Position }): void => {
    read.diffs.forEach((diff) => {
      const diffX =
        Number(diff.interval.start - this._focusedRegion!.interval.start) * this._nucWidth;
      switch (diff.type) {
        case "mismatch": {
          this._displayMismatch({ nuc: diff.sequence, pos: { x: diffX, y: pos.y } });
          break;
        }
        case "ins":
          this._displayInsertion({ diff, pos: { x: diffX, y: pos.y } });
          break;
        case "del":
          this._displayDeletion({ diff, pos: { x: diffX, y: pos.y } });
          break;
        case "softClip":
          this._displaySoftClip({ diff, pos: { x: diffX, y: pos.y } });
          break;
      }
    });
  };

  /**
   * Render a tooltip over a hovered read.
   */
  _displayTooltip = ({ read, pos }: { readonly read: AlignedRead; pos: Position }) => {
    this._tooltip.setRead(read);
    this._tooltip.x = pos.x;
    this._tooltip.y = pos.y;
    if (
      pos.x - this._viewportOffset.x + this._tooltip.width + TOOLTIP_SCREEN_EDGE_PADDING >
      this.canvas.offsetLeft + this.canvas.offsetWidth
    ) {
      this._tooltip.x -= this._tooltip.width;
    }
    if (
      pos.y + this._tooltip.height + TOOLTIP_SCREEN_EDGE_PADDING >
      this.canvas.offsetTop + this.canvas.offsetHeight
    ) {
      this._tooltip.y -= this._tooltip.height;
    }
    this._tooltip.visible = true;
  };

  _removeTooltip = (): void => {
    this._tooltip.visible = false;
  };

  /**
   * Display a single aligned read.
   */
  _displayRead = ({ read, pos }: { readonly read: AlignedRead; readonly pos: Position }): void => {
    const width = Number(getLength(read.region)) * this._nucWidth;

    const onMouseOver = (event: PIXI.FederatedPointerEvent): void => {
      if (!this._isDragging) {
        this._displayTooltip({
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
      this._removeTooltip();
    };

    if (read.isReverse) {
      this._drawPool.draw(REVERSE_READ_CAP_POOL, {
        pos: { x: pos.x - CAP_WIDTH, y: pos.y },
        dim: { width: CAP_WIDTH, height: READ_HEIGHT },
        onMouseOver,
        onMouseOut,
      });
    } else {
      this._drawPool.draw(FORWARD_READ_CAP_POOL, {
        pos: { x: pos.x + width, y: pos.y },
        dim: { width: CAP_WIDTH, height: READ_HEIGHT },
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
    this._displayDiffs({ read, pos });
  };

  _displayAlignment = ({
    alignment,
    pos,
  }: {
    readonly alignment: AlignedPair;
    readonly pos: Position;
  }): void => {
    let reads;
    if (alignment.type == "pairedReadsKind") {
      reads = [alignment.read1, alignment.read2];
      this._displayPairLine({ pos, alignment });
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
        this._displayRead({ read, pos: { x: readX, y: pos.y } });
      } catch (error) {
        LOG.error(`Error displaying read: ${error} - ${JSON.stringify(read)}`);
      }
    });
  };

  setState = ({
    alignments = this._alignments,
    focusedRegion = this._focusedRegion,
    viewportWidth = this._dim.width,
    viewportHeight = this._dim.height,
  }: Partial<AlignedReadsSceneState>): void => {
    this._alignments = alignments;
    this._focusedRegion = focusedRegion;
    this.resize({ width: viewportWidth, height: viewportHeight });
    if (this._alignments === null || this._focusedRegion === null) {
      this.viewport.resize(this._dim.width, this._dim.height);
      return;
    }

    if (
      focusedRegion !== this._focusedRegion ||
      viewportWidth !== this._dim.width ||
      viewportHeight !== this._dim.height
    ) {
      this._removeTooltip();
    }

    this._nucWidth = this._dim.width / this._focusedRegionLength!;
    this._bufferDim = {
      width: Math.round(this._nucWidth * this._bufferedRegionLength!),
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
    y = Math.min(Math.max(0, y), maxY);
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
    this._removeTooltip();

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
        this._displayAlignment({
          alignment,
          pos: { x, y },
        });
      });
      y += ROW_HEIGHT;
    });
  };

  destroy = () => {
    this.pixiApp.destroy();
    Array.from(this._textures.values()).forEach((texture) => texture.destroy());
    document.removeEventListener("mousedown", this._handleMouseDown);
  };
}
