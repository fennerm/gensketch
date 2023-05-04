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

import { ValidationError } from "@lib/errors";
import LOG from "@lib/logger";
import { assertIsDefined, type Dimensions, type Position } from "@lib/types";
import { range } from "@lib/util";

import DejaVuSansMonoPngUrl from "../../assets/DejaVuSansMono_0.png?url";
import DejaVuSansMonoFntContents from "../../assets/DejaVuSansMono.fnt?raw";

// If the width of a nucleotide in pixels is greater than this threshold then render the letter
// rather than a colored rectangle.
export const DRAW_LETTER_THRESHOLD = 12;

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

export class PixiApplication {
  renderer: Renderer;
  ticker: Ticker;
  stage: Container;

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

    if (layered) {
      this.stage = new LayeredStage();
      this.stage.sortableChildren = true;
    } else {
      this.stage = new Container();
    }
    this.ticker = new Ticker();

    this.ticker.add(() => {
      this.renderer.render(this.stage);
    });
    this.ticker.start();
  }

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

  resize = (dim: Dimensions): void => {
    if (this.renderer.view.style !== undefined) {
      this.renderer.view.style.width = dim.width + "px";
      this.renderer.view.style.height = dim.height + "px";
    }
    this.renderer.resize(dim.width, dim.height);
  };

  destroy = (): void => {
    this.renderer.destroy(true);
    this.stage.destroy(true);
  };
}

export type DrawId = string;

export interface TaggedDrawObject {
  id: DrawId;
  object: Container;
}

export type DrawFunction = () => Container;

export class DrawPool {
  id: number;
  stage: Container;
  drawFn: DrawFunction;
  poolsize: number;
  objects: TaggedDrawObject[];
  activeObjects: Map<DrawId, Container>;
  stepSize: number;

  constructor({
    stage,
    drawFn,
    poolsize,
    stepSize,
  }: {
    stage: Container;
    drawFn: () => Container;
    poolsize?: number;
    stepSize?: number;
  }) {
    poolsize = poolsize === undefined ? 100 : poolsize;
    if (poolsize <= 0) {
      throw "poolsize must be >0";
    }

    this.id = Math.floor(Math.random() * 10000);
    this.stage = stage;
    this.stepSize = stepSize === undefined ? 100 : stepSize;
    this.drawFn = drawFn;
    this.objects = [];
    this.activeObjects = new Map<DrawId, Container>();
    this.poolsize = 0;
    this.expandPool(poolsize);
  }

  addToStage = (object: Container) => {
    this.stage.addChild(object);
  };

  expandPool = (newPoolsize: number): void => {
    const newObjects = range(this.poolsize, newPoolsize).map((id) => {
      const object = this.drawFn();
      object.visible = false;
      this.addToStage(object);
      return { id: id.toString(), object };
    });

    this.objects.push(...newObjects);
    this.poolsize = newPoolsize;
  };

  draw = (drawArgs: DrawArgs): TaggedDrawObject => {
    if (this.objects.length == 0) {
      this.expandPool(this.poolsize + this.stepSize);
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

  recycleAll = (): void => {
    for (const id of this.activeObjects.keys()) {
      this.recycle(id);
    }
  };
}

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

export class DrawPoolGroup {
  drawConfig: DrawPoolConfig;
  pools: Map<DrawClass, DrawPool>;
  stage: Container;

  constructor({ drawConfig, stage }: { drawConfig: DrawPoolConfig; stage: Container }) {
    this.drawConfig = drawConfig;
    this.pools = new Map();
    this.stage = stage;
    this.initPools();
  }

  initPools = (): void => {
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

  recycle = (drawClass: DrawClass, id: DrawId): void => {
    this.pools.get(drawClass)?.recycle(id);
  };

  recycleAll = (): void => {
    for (const pool of this.pools.values()) {
      pool.recycleAll();
    }
  };
}

export type TriangleVertices = [Position, Position, Position];

export const drawTriangle = ({
  vertices,
  tint,
  layer,
}: {
  readonly vertices: TriangleVertices;
  tint: number;
  layer?: LayerGroup;
}): Graphics => {
  const triangle = new Graphics();
  const lastVertex = vertices[vertices.length - 1];
  triangle.beginFill(tint).moveTo(lastVertex.x, lastVertex.y);
  vertices.forEach((vertex) => {
    triangle.lineTo(vertex.x, vertex.y);
  });
  triangle.endFill();
  if (layer !== undefined) {
    triangle.parentGroup = layer;
  }
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

export const drawText = ({
  text,
  pos = { x: 0, y: 0 },
  style,
  layer,
}: {
  text: string;
  pos?: Position;
  style?: Partial<IBitmapTextStyle>;
  layer?: LayerGroup;
}): BitmapText => {
  style = style === undefined ? {} : style;
  style.fontSize = style.fontSize === undefined ? 20 : style.fontSize;
  style.fontName = style.fontName === undefined ? "DejaVu Sans Mono" : style.fontName;
  style.align = style.align === undefined ? "center" : style.align;
  const textObj = new BitmapText(text, style);
  if (layer !== undefined) {
    textObj.parentGroup = layer;
  }
  textObj.position.set(pos.x, pos.y);
  return textObj;
};
