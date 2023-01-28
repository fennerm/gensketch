import * as PIXI from "pixi.js";
import { Graphics, Sprite } from "pixi.js";

import { Dimensions } from "./types";

export interface PixiConstructorParams {
  backgroundColor: number;
}

export class PixiApplication {
  renderer: PIXI.Renderer;
  ticker: PIXI.Ticker;
  stage: PIXI.Container;
  dimensions: Dimensions;

  constructor({ backgroundColor }: PixiConstructorParams) {
    this.dimensions = { width: 800, height: 600 };
    this.renderer = new PIXI.Renderer({ backgroundColor });
    this.stage = new PIXI.Container();
    this.ticker = new PIXI.Ticker();
    this.ticker.add(() => {
      this.renderer.render(this.stage);
    }, PIXI.UPDATE_PRIORITY.LOW);
    this.ticker.start();
  }

  resize = (width: number, height: number): void => {
    this.renderer.resize(width, height);
    this.dimensions = { width, height };
  };

  destroy = (): void => {
    this.renderer.destroy(true);
    this.stage.destroy(true);
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
