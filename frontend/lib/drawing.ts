import * as PIXI from "pixi.js";

import DejaVuSansMonoUrl from "../assets/DejaVuSansMono.fnt?url";
import { ValidationError } from "./errors";
import LOG from "./logger";
import { CSSDimensions, Dimensions, Position, assertIsDefined } from "./types";
import { range } from "./util";

export const DRAW_LETTER_THRESHOLD = 12;
const DEFAULT_ALIGNMENT_COLOR = 0x969592;

export const loadPixiAssets = (): PIXI.Loader => {
  LOG.debug("Initializing Pixi.js");
  const loader = new PIXI.Loader();
  return loader.add("monospace", DejaVuSansMonoUrl);
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
}: {
  container: PIXI.Container;
  readonly pos?: Position;
  readonly dim?: Dimensions;
  fontSize?: number;
  visible?: boolean;
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
};

export interface PixiConstructorParams {
  backgroundColor: number;
}

export class PixiApplication {
  renderer: PIXI.Renderer;
  ticker: PIXI.Ticker;
  root: PIXI.Container;
  stage: PIXI.Container;
  dimensions: CSSDimensions;

  constructor({ backgroundColor }: PixiConstructorParams) {
    this.dimensions = { width: 800, height: 600 };
    this.renderer = new PIXI.Renderer({
      backgroundColor,
      antialias: true,
      resolution: window.devicePixelRatio,
    });

    this.root = new PIXI.Container();

    this.ticker = new PIXI.Ticker();
    this.stage = this.root;

    this.ticker.add(() => {
      this.renderer.render(this.stage);
    }, PIXI.UPDATE_PRIORITY.LOW);
    this.ticker.start();
  }

  resize = (width: number, height: number): void => {
    this.dimensions = { width, height };
    this.renderer.resize(width, height);
  };

  destroy = (): void => {
    this.renderer.destroy(true);
    this.root.destroy(true);
  };
}

export class RenderQueue {
  stage: PIXI.Container;
  graphicsQueue: PIXI.Graphics[];
  spriteQueue: PIXI.Sprite[];

  constructor(stage: PIXI.Container) {
    this.stage = stage;
    this.graphicsQueue = [];
    this.spriteQueue = [];
  }

  render = (...objs: (PIXI.Graphics | PIXI.Sprite)[]) => {
    objs.forEach((obj) => {
      if (obj instanceof PIXI.Graphics) {
        this.graphicsQueue.push(obj);
      } else {
        this.spriteQueue.push(obj);
      }
      this.stage.addChild(obj);
    });
  };

  clearStage = (): void => {
    this.graphicsQueue.forEach((obj) => obj.destroy());
    this.stage.removeChildren();
    this.graphicsQueue = [];
    this.spriteQueue = [];
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
}

export type DrawFunction = () => PIXI.Container;

export class DrawPool {
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
    stage: PIXI.Container | Scrollbox;
    drawFn: () => PIXI.Container;
    poolsize?: number;
    stepSize?: number;
  }) {
    poolsize = poolsize === undefined ? 100 : poolsize;
    if (poolsize <= 0) {
      throw "poolsize must be >0";
    }

    this.stage = stage;
    this.stepSize = stepSize === undefined ? 100 : stepSize;
    this.drawFn = drawFn;
    this.objects = [];
    this.activeObjects = new Map<DrawId, PIXI.Container>();
    this.poolsize = 0;
    this.expandPool(poolsize);
  }

  addToStage = (object: PIXI.Container) => {
    if (this.stage instanceof Scrollbox) {
      this.stage.content.addChild(object);
    } else {
      this.stage.addChild(object);
    }
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

  draw = ({ pos, dim, fontSize }: DrawArgs): TaggedDrawObject => {
    if (this.objects.length == 0) {
      this.expandPool(this.poolsize + this.stepSize);
    }
    const taggedObject = this.objects.pop();
    assertIsDefined(taggedObject);

    updateIfChanged({ container: taggedObject.object, pos, dim, fontSize, visible: true });

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
    for (let id of this.activeObjects.keys()) {
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

export class StageManager {
  drawConfig: DrawConfig;
  pools: Map<DrawClass, DrawPool>;
  stage: PIXI.Container | Scrollbox;

  constructor({
    drawConfig,
    stage,
  }: {
    drawConfig: DrawConfig;
    stage: PIXI.Container | Scrollbox;
  }) {
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
}: {
  color?: number;
  pos?: Position;
  dim?: Dimensions;
}): PIXI.Sprite => {
  const rect = PIXI.Sprite.from(PIXI.Texture.WHITE);
  dim = dim === undefined ? { width: 10, height: 5 } : dim;
  pos = pos === undefined ? { x: 0, y: 0 } : pos;
  rect.width = dim.width;
  rect.height = dim.height;
  rect.position.set(pos.x, pos.y);
  if (color !== undefined) {
    rect.tint = color;
  }
  return rect;
};

const FORWARD_READ_CAP_GEOMETRY = drawTriangle({
  vertices: [
    { x: 0, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 10 },
  ],
  color: DEFAULT_ALIGNMENT_COLOR,
}).geometry;

const REVERSE_READ_CAP_GEOMETRY = drawTriangle({
  vertices: [
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 5 },
  ],
  color: DEFAULT_ALIGNMENT_COLOR,
}).geometry;

export const drawReadCap = ({
  geometry,
  pos,
  dim,
  color,
}: {
  geometry: PIXI.GraphicsGeometry;
  readonly pos?: Position;
  readonly dim?: Dimensions;
  color?: number;
}): PIXI.Graphics => {
  color = color === undefined ? DEFAULT_ALIGNMENT_COLOR : color;
  pos = pos === undefined ? { x: 0, y: 0 } : pos;
  dim = dim === undefined ? { width: 5, height: 5 } : dim;
  const cap = new PIXI.Graphics(geometry);
  updateIfChanged({ container: cap, pos, dim });
  return cap;
};

export const drawForwardReadCap = ({
  pos,
  dim,
  color,
}: {
  readonly pos?: Position;
  readonly dim?: Dimensions;
  color?: number;
}): PIXI.Graphics => {
  return drawReadCap({ geometry: FORWARD_READ_CAP_GEOMETRY, pos, dim, color });
};

export const drawReverseReadCap = ({
  pos,
  dim,
  color,
}: {
  readonly pos?: Position;
  readonly dim?: Dimensions;
  color?: number;
}): PIXI.Graphics => {
  return drawReadCap({ geometry: REVERSE_READ_CAP_GEOMETRY, pos, dim, color });
};

export const drawText = ({
  content,
  style,
}: {
  content: string;
  style?: Partial<PIXI.IBitmapTextStyle>;
}): PIXI.BitmapText => {
  style = style === undefined ? {} : style;
  style.fontSize = style.fontSize === undefined ? 23 : style.fontSize;
  style.fontName = style.fontName === undefined ? "DejaVu Sans Mono" : style.fontName;
  style.align = style.align === undefined ? "center" : style.align;
  return new PIXI.BitmapText(content, style);
};
