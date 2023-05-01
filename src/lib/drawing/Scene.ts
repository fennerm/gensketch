import type { StyleConfig } from "@lib/bindings";
import { type DrawPoolGroup, PixiApplication } from "@lib/drawing/drawing";
import type { Dimensions } from "@lib/types";

export interface SceneParams {
  canvas: HTMLElement;
  dim: Dimensions;
  styles: StyleConfig;
  layered?: boolean;
}

export abstract class Scene {
  pixiApp: PixiApplication;
  canvas: HTMLElement;
  _dim: Dimensions;
  _styles: StyleConfig;
  abstract _drawPool: DrawPoolGroup;

  constructor({ canvas, dim, styles, layered = false }: SceneParams) {
    this.canvas = canvas;
    this._dim = dim;
    this._styles = styles;
    this.pixiApp = new PixiApplication({ dim: this._dim, layered });
    this.canvas.appendChild(this.pixiApp.renderer.view as HTMLCanvasElement);
  }

  clear = (): void => {
    this._drawPool.recycleAll();
  };

  destroy = (): void => {
    this.pixiApp.destroy();
  };

  resize = (dim: Dimensions): void => {
    this._dim = dim;
    this.pixiApp.resize(this._dim);
  };

  abstract draw(): void;
}
