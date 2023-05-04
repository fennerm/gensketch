import { type Group as LayerGroup, Stage as LayeredStage } from "@pixi/layers";
import {
  BitmapFont,
  BitmapText,
  Container,
  FederatedPointerEvent,
  Graphics,
  type IBitmapTextStyle,
  Renderer,
  RenderTexture,
  Sprite,
  Texture,
  Ticker,
} from "pixi.js";
import { v4 as uuidv4 } from "uuid";

import { ValidationError } from "@lib/errors";
import LOG from "@lib/logger";
import { assertIsDefined, type Dimensions, type Position } from "@lib/types";
import { range } from "@lib/util";

import DejaVuSansMonoPngUrl from "../../assets/DejaVuSansMono_0.png?url";
import DejaVuSansMonoFntContents from "../../assets/DejaVuSansMono.fnt?raw";

// If the width of a nucleotide in pixels is greater than this threshold then render the letter
// rather than a colored rectangle.
export const DRAW_LETTER_THRESHOLD = 12;

export const MONOSPACE_FONT = "DejaVu Sans Mono";

/**
 * Load shared PIXI assets (e.g. fonts) into the PIXI cache.
 */
export const loadPixiAssets = (): void => {
  const pngTexture = Texture.from(DejaVuSansMonoPngUrl);
  BitmapFont.install(DejaVuSansMonoFntContents, pngTexture);
  LOG.debug("PIXI assets loaded");
};

export const isBitmapText = (obj: any): obj is BitmapText => {
  return obj.fontSize !== undefined;
};

export const hasTint = (obj: any): obj is Sprite => {
  return obj.tint !== undefined;
};

export interface DrawArgs {
  readonly pos?: Position;
  readonly dim?: Dimensions;
  text?: string;
  fontSize?: number;
  interactive?: boolean;
  interactiveChildren?: boolean;
  layer?: LayerGroup;
  tint?: number;
  onMouseOver?: (event: FederatedPointerEvent) => void;
  onMouseOut?: (event: FederatedPointerEvent) => void;
}

export interface UpdateDrawArgs extends DrawArgs {
  container: Container;
  visible?: boolean;
}

/**
 * Update attributes of a PIXI object if they have changed.
 */
export const updateIfChanged = ({
  container,
  pos,
  dim,
  fontSize,
  text,
  visible,
  interactive,
  interactiveChildren,
  onMouseOver,
  onMouseOut,
  layer,
  tint,
}: UpdateDrawArgs): void => {
  if (pos !== undefined && pos.x !== container.x) {
    container.x = pos.x;
  }
  if (pos !== undefined && pos.y !== container.y) {
    container.y = pos.y;
  }
  if (dim !== undefined && dim.width !== container.width) {
    container.width = dim.width;
  }
  if (dim !== undefined && dim.height !== container.height) {
    container.height = dim.height;
  }
  if (visible !== undefined && container.visible !== visible) {
    container.visible = visible;
  }
  if (hasTint(container) && tint !== undefined && container.tint !== tint) {
    container.tint = tint;
  }
  if (interactive !== undefined && container.interactive !== interactive) {
    container.interactive = interactive;
  }
  if (interactiveChildren !== undefined && container.interactiveChildren !== interactiveChildren) {
    container.interactiveChildren = interactiveChildren;
  }
  if (onMouseOver !== undefined) {
    container.addEventListener("mouseover", onMouseOver);
  }
  if (onMouseOut !== undefined) {
    container.addEventListener("mouseout", onMouseOut);
  }
  if (layer !== undefined) {
    container.parentGroup = layer;
  }
  if (isBitmapText(container)) {
    if (fontSize !== undefined && fontSize !== container.fontSize) {
      container.fontSize = fontSize;
    }
    if (text !== undefined && text !== container.text) {
      container.text = text;
    }
  }
};

/**
 * A custom PIXI application with a renderer, ticker, and stage.
 */
export class PixiApplication {
  renderer: Renderer;
  ticker: Ticker;
  stage: Container;

  /**
   * @param layered - If true, use a LayeredStage instead of a Container (enables improved
   *  z-indexing).
   */
  constructor({
    dim = { width: 800, height: 600 },
    layered = false,
  }: {
    dim: Dimensions;
    layered: boolean;
  }) {
    this.renderer = new Renderer({
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio,
    });
    this.resize(dim);

    this.stage = this._initStage(layered);
    this.ticker = this._initTicker();
    this.ticker.start();
  }

  /**
   * Initialize the stage where the renderer draws to.
   */
  _initStage = (layered: boolean): Container => {
    let stage;
    if (layered) {
      stage = new LayeredStage();
      stage.sortableChildren = true;
    } else {
      stage = new Container();
    }
    return stage;
  };

  /**
   * Initialize the ticker which controls the render loop.
   */
  _initTicker = (): Ticker => {
    const ticker = new Ticker();

    // Prevent too many unnecessary renders since we're not really animating anything.
    ticker.speed = 0.2;

    ticker.add(() => {
      this.renderer.render(this.stage);
    });
    return ticker;
  };

  /**
   * Load a RenderTexture into PIXI's cache.
   * @param shape - The shape which the texture will be applied to.
   * @param texture - The texture to load.
   * @param cleanupGraphic - If true, destroy the shape after loading the texture.
   */
  loadRenderTexture = ({
    shape,
    texture,
    cleanupGraphic = true,
  }: {
    shape: Graphics;
    readonly texture: RenderTexture;
    cleanupGraphic?: boolean;
  }): void => {
    this.renderer.render(shape, { renderTexture: texture });
    if (cleanupGraphic) {
      shape.destroy(true);
    }
  };

  /**
   * Resize the renderer and stage.
   */
  resize = (dim: Dimensions): void => {
    if (this.renderer.view.style !== undefined) {
      this.renderer.view.style.width = dim.width + "px";
      this.renderer.view.style.height = dim.height + "px";
    }
    this.renderer.resize(dim.width, dim.height);
  };

  /**
   * Must be called to clean up the PIXI application or else we leak memory.
   */
  destroy = (): void => {
    this.ticker.stop();
    this.renderer.destroy(true);
    this.stage.destroy(true);
  };
}

// Unique ID for a PIXI object in a draw pool.
export type DrawId = string;

// A PIXI object with its associated unique ID.
export interface TaggedDrawObject {
  id: DrawId;
  object: Container;
}

// A function which returns a PIXI object to be stored in a draw pool.
export type DrawFunction = () => Container;

/**
 * Manages a pool of pre-rendered PIXI objects which can be drawn to the screen.
 *
 * When an object is drawn, it is popped from the pool and made visible. When it is no longer
 * needed it is made invisible and returned to the pool. Pool is automatically resized if we attempt
 * to draw more objects when the pool is empty.
 *
 * @public id - Unique ID for this draw pool.
 * @public stage - The PIXI container to draw to.
 * @public drawFn - Function which is called to create a new object to be stored in the pool.
 * @public poolsize - The starting poolsize.
 * @public stepSize - How many objects to add to the pool when it is expanded.
 * @public objects - Objects in the pool which are available for drawing
 * @public activeObjects - Objects which are currently being displayed.
 */
export class DrawPool {
  id: string;
  stage: Container;
  drawFn: DrawFunction;
  poolsize: number;
  stepSize: number;
  objects: TaggedDrawObject[];
  activeObjects: Map<DrawId, Container>;

  constructor({
    stage,
    drawFn,
    poolsize = 100,
    stepSize = 100,
  }: {
    stage: Container;
    drawFn: () => Container;
    poolsize?: number;
    stepSize?: number;
  }) {
    if (poolsize <= 0) {
      throw "poolsize must be >0";
    }

    this.id = uuidv4();
    this.stage = stage;
    this.stepSize = stepSize;
    this.poolsize = poolsize;
    this.drawFn = drawFn;
    this.objects = [];
    this.activeObjects = new Map<DrawId, Container>();
    this._expandPool(poolsize);
  }

  _addToStage = (object: Container) => {
    this.stage.addChild(object);
  };

  _expandPool = (newPoolsize: number): void => {
    const newObjects = range(this.poolsize, newPoolsize).map((id) => {
      const object = this.drawFn();
      object.visible = false;
      this._addToStage(object);
      return { id: id.toString(), object };
    });

    this.objects.push(...newObjects);
    this.poolsize = newPoolsize;
  };

  draw = (drawArgs: DrawArgs): TaggedDrawObject => {
    if (this.objects.length == 0) {
      this._expandPool(this.poolsize + this.stepSize);
    }
    const taggedObject = this.objects.pop();
    assertIsDefined(taggedObject);

    taggedObject.object.removeAllListeners();
    updateIfChanged({
      container: taggedObject.object,
      visible: true,
      ...drawArgs,
    });

    this.activeObjects.set(taggedObject.id, taggedObject.object);
    return taggedObject;
  };

  /**
   * Return an object to the pool.
   */
  recycle = (id: DrawId): void => {
    const object = this.activeObjects.get(id);
    if (object === undefined) {
      LOG.warn(`Attempted to recycle non-existant sprite id=${id}`);
      return;
    }
    object.visible = false;
    this.objects.push({ id, object });
    this.activeObjects.delete(id);
  };

  /**
   * Return all displayed objects to the pool.
   */
  recycleAll = (): void => {
    for (const id of this.activeObjects.keys()) {
      this.recycle(id);
    }
  };
}

// Name for a draw pool in a draw pool group.
export type DrawClass = string;

export type DrawPoolConfig = {
  [name: DrawClass]: {
    drawFn: DrawFunction;
    poolsize?: number;
  };
};

export interface ManagedDrawObject extends TaggedDrawObject {
  drawClass: DrawClass;
}

/**
 * A group of draw pools which contain all of the objects which need to be drawn in a scene.
 *
 * @public drawConfig - Defines the config for all DrawPools in the group
 * @public pools - The DrawPools in the group.
 * @public stage - The PIXI container to draw to.
 */
export class DrawPoolGroup {
  drawConfig: DrawPoolConfig;
  pools: Map<DrawClass, DrawPool>;
  stage: Container;

  constructor({ drawConfig, stage }: { drawConfig: DrawPoolConfig; stage: Container }) {
    this.drawConfig = drawConfig;
    this.pools = new Map();
    this.stage = stage;
    this._initPools();
  }

  _initPools = (): void => {
    Object.entries(this.drawConfig).forEach(([drawClass, { drawFn, poolsize }]) => {
      this.pools.set(drawClass, new DrawPool({ stage: this.stage, drawFn, poolsize }));
    });
  };

  draw = (drawClass: DrawClass, drawArgs: DrawArgs): ManagedDrawObject => {
    const taggedDrawObject = this.pools.get(drawClass)?.draw(drawArgs);
    if (taggedDrawObject === undefined) {
      throw new ValidationError(`${drawClass} is not a valid draw target`);
    }
    return { ...taggedDrawObject, drawClass };
  };

  /**
   * Recycle a specific object in a draw pool.
   */
  recycle = (drawClass: DrawClass, id: DrawId): void => {
    this.pools.get(drawClass)?.recycle(id);
  };

  /**
   * Recycle all objects in all draw pools.
   */
  recycleAll = (): void => {
    for (const pool of this.pools.values()) {
      pool.recycleAll();
    }
  };
}

export type TriangleVertices = [Position, Position, Position];

export interface TriangleDrawArgs extends DrawArgs {
  readonly vertices: TriangleVertices;
}

export const drawTriangle = ({
  vertices,
  interactive = false,
  interactiveChildren = false,
  ...drawArgs
}: TriangleDrawArgs): Graphics => {
  const triangle = new Graphics();
  const lastVertex = vertices[vertices.length - 1];
  let color = drawArgs.tint;
  if (color === undefined) {
    color = 0xffffff;
  }
  triangle.beginFill(color).moveTo(lastVertex.x, lastVertex.y);
  vertices.forEach((vertex) => {
    triangle.lineTo(vertex.x, vertex.y);
  });
  triangle.endFill();
  updateIfChanged({ container: triangle, interactive, interactiveChildren, ...drawArgs });
  return triangle;
};

export const drawRect = ({
  pos = { x: 0, y: 0 },
  dim = { width: 10, height: 5 },
  interactive = false,
  interactiveChildren = false,
  ...drawArgs
}: DrawArgs): Sprite => {
  const rect = Sprite.from(Texture.WHITE);
  updateIfChanged({ container: rect, pos, dim, interactive, interactiveChildren, ...drawArgs });
  return rect;
};

export interface TextDrawArgs extends DrawArgs {
  style?: Partial<IBitmapTextStyle>;
}

export const drawText = ({
  pos = { x: 0, y: 0 },
  text = "",
  style,
  ...drawArgs
}: TextDrawArgs): BitmapText => {
  style = style === undefined ? {} : style;
  style.fontSize = style.fontSize === undefined ? 15 : style.fontSize;
  style.fontName = style.fontName === undefined ? MONOSPACE_FONT : style.fontName;
  style.align = style.align === undefined ? "center" : style.align;
  const textObj = new BitmapText(text, style);
  updateIfChanged({ container: textObj, pos, ...drawArgs });
  return textObj;
};
