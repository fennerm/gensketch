import * as PIXI from "pixi.js";

interface Dimensions {
  width: number;
  height: number;
}

export class PixiApplication {
  renderer: PIXI.Renderer;
  ticker: PIXI.Ticker;
  stage: PIXI.Container;
  dimensions: Dimensions;

  constructor({ backgroundColor }: { backgroundColor: number }) {
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
