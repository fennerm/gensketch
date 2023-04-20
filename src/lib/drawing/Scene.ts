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
  dim: Dimensions;
  canvas: HTMLElement;
  styles: StyleConfig;
  abstract drawPool: DrawPoolGroup;

  constructor({ canvas, dim, styles, layered = false }: SceneParams) {
    this.canvas = canvas;
    this.dim = dim;
    this.styles = styles;
    this.pixiApp = new PixiApplication({ dim: this.dim, layered });
    this.canvas.appendChild(this.pixiApp.renderer.view as HTMLCanvasElement);
  }

  clear = (): void => {
    this.drawPool.recycleAll();
  };

  destroy = (): void => {
    this.pixiApp.destroy();
  };

  resize = (dim: Dimensions): void => {
    this.dim = dim;
    this.pixiApp.resize(this.dim);
  };

  abstract draw(): void;
}
