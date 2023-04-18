import DejaVuSansMonoUrl from "../../assets/DejaVuSansMono.fnt?url";
import { ValidationError } from "@lib/errors";
import LOG from "@lib/logger";
import type { CSSDimensions, Dimensions, Position } from "@lib/types";
import { assertIsDefined } from "@lib/types";
import { range } from "@lib/util";
import * as PIXI from "pixi.js";

export const DRAW_LETTER_THRESHOLD = 12;
const DEFAULT_ALIGNMENT_COLOR = 0x969592;

export const loadPixiAssets = (): Promise<any> => {
  LOG.debug("Initializing Pixi.js");
  return PIXI.Assets.load(DejaVuSansMonoUrl);
};

export const isBitmapText = (obj: any): obj is PIXI.BitmapText => {
  return obj.fontSize !== undefined;
};

// Update the position/dimensions of a PIXI sprite but only if they actually changed.
//
// I'm unsure if this guard is actually necessary, but including it to be safe.
export const updateIfChanged = ({
  container,
  pos,
  dim,
  fontSize,
  visible,
  onMouseOver,
  onMouseOut,
  zIndex,
}: {
  container: PIXI.Container;
  readonly pos?: Position;
  readonly dim?: Dimensions;
  fontSize?: number;
  visible?: boolean;
  onMouseOver?: (event: PIXI.FederatedPointerEvent) => void;
  onMouseOut?: (event: PIXI.FederatedPointerEvent) => void;
  zIndex?: number;
}): void => {
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
  if (fontSize !== undefined && isBitmapText(container) && fontSize !== container.fontSize) {
    container.fontSize = fontSize;
  }
  if (visible !== undefined && container.visible !== visible) {
    container.visible = visible;
  }
  if (onMouseOver !== undefined) {
    container.addEventListener("mouseover", onMouseOver);
  }

  if (onMouseOut !== undefined) {
    container.addEventListener("mouseout", onMouseOut);
  }
  if (zIndex !== undefined && zIndex !== container.zIndex) {
    container.zIndex = zIndex;
  }
};

export interface PixiConstructorParams {
  backgroundColor: number;
}

export class PixiApplication {
  renderer: PIXI.Renderer;
  ticker: PIXI.Ticker;
  stage: PIXI.Container;

  constructor(dim: Dimensions = { width: 800, height: 600 }) {
    this.renderer = new PIXI.Renderer({
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio,
    });
    this.resize(dim);

    this.stage = new PIXI.Container();
    this.ticker = new PIXI.Ticker();

    this.ticker.add(() => {
      this.renderer.render(this.stage);
    }, PIXI.UPDATE_PRIORITY.LOW);
    this.ticker.start();
  }

  loadRenderTexture = ({
    shape,
    texture,
    cleanupGraphic = true,
  }: {
    shape: PIXI.Graphics;
    readonly texture: PIXI.RenderTexture;
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
  object: PIXI.Container;
}

export interface DrawArgs {
  pos?: Position;
  dim?: Dimensions;
  fontSize?: number;
  onMouseOver?: (event: PIXI.FederatedPointerEvent) => void;
  onMouseOut?: (event: PIXI.FederatedPointerEvent) => void;
}

export type DrawFunction = () => PIXI.Container;

export class DrawPool {
  id: number;
  stage: PIXI.Container;
  drawFn: DrawFunction;
  poolsize: number;
  objects: TaggedDrawObject[];
  activeObjects: Map<DrawId, PIXI.Container>;
  stepSize: number;

  constructor({
    stage,
    drawFn,
    poolsize,
    stepSize,
  }: {
    stage: PIXI.Container;
    drawFn: () => PIXI.Container;
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
    this.activeObjects = new Map<DrawId, PIXI.Container>();
    this.poolsize = 0;
    this.expandPool(poolsize);
  }

  addToStage = (object: PIXI.Container) => {
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

  draw = ({ pos, dim, fontSize, onMouseOver, onMouseOut }: DrawArgs): TaggedDrawObject => {
    if (this.objects.length == 0) {
      this.expandPool(this.poolsize + this.stepSize);
    }
    const taggedObject = this.objects.pop();
    assertIsDefined(taggedObject);

    taggedObject.object.removeAllListeners();
    updateIfChanged({
      container: taggedObject.object,
      pos,
      dim,
      fontSize,
      visible: true,
      onMouseOut,
      onMouseOver,
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

export type DrawConfig = {
  [name: DrawClass]: {
    drawFn: DrawFunction;
    poolsize?: number;
  };
};

export interface ManagedDrawObject extends TaggedDrawObject {
  drawClass: DrawClass;
}

export class DrawPoolGroup {
  drawConfig: DrawConfig;
  pools: Map<DrawClass, DrawPool>;
  stage: PIXI.Container;

  constructor({ drawConfig, stage }: { drawConfig: DrawConfig; stage: PIXI.Container }) {
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
  color,
}: {
  readonly vertices: TriangleVertices;
  color: number;
}): PIXI.Graphics => {
  const triangle = new PIXI.Graphics();
  const lastVertex = vertices[vertices.length - 1];
  triangle.beginFill(color).moveTo(lastVertex.x, lastVertex.y);
  vertices.forEach((vertex) => {
    triangle.lineTo(vertex.x, vertex.y);
  });
  triangle.endFill();
  return triangle;
};

export const drawRect = ({
  color,
  pos,
  dim,
  interactive = false,
  zIndex,
}: {
  color?: number;
  pos?: Position;
  dim?: Dimensions;
  interactive?: boolean;
  zIndex?: number;
}): PIXI.Sprite => {
  const rect = PIXI.Sprite.from(PIXI.Texture.WHITE);
  dim = dim === undefined ? { width: 10, height: 5 } : dim;
  pos = pos === undefined ? { x: 0, y: 0 } : pos;
  rect.width = dim.width;
  rect.height = dim.height;
  rect.interactive = interactive;
  rect.position.set(pos.x, pos.y);
  if (color !== undefined) {
    rect.tint = color;
  }
  if (zIndex !== undefined) {
    rect.zIndex = zIndex;
  }
  return rect;
};

export const drawText = ({
  content,
  style,
  zIndex,
}: {
  content: string;
  style?: Partial<PIXI.IBitmapTextStyle>;
  zIndex?: number;
}): PIXI.BitmapText => {
  style = style === undefined ? {} : style;
  style.fontSize = style.fontSize === undefined ? 20 : style.fontSize;
  style.fontName = style.fontName === undefined ? "DejaVu Sans Mono" : style.fontName;
  style.align = style.align === undefined ? "center" : style.align;
  const text = new PIXI.BitmapText(content, style);
  if (zIndex !== undefined) {
    text.zIndex = zIndex;
  }
  return text;
};
