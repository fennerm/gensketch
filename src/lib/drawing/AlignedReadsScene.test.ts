/**
 * @jest-environment jsdom
 */

import { fakeUserConfig } from "../testUtil/fixtures";
import { AlignedReadsScene } from "./AlignedReadsScene";

test("viewport initialization", async () => {
  document.body.innerHTML = '<div class="alignments-canvas"></div>';
  const canvas = document.getElementsByClassName("alignments-canvas")[0] as HTMLDivElement;
  const styles = fakeUserConfig().styles;
  const dim = { width: 800, height: 600 };
  const scene = new AlignedReadsScene({
    dim,
    handleClick: () => {},
    canvas,
    styles,
  });
  expect(scene.viewport.screenWidth).toEqual(dim.width);
  expect(scene.viewport.screenHeight).toEqual(dim.height);
  expect(scene.viewport.worldHeight).toEqual(dim.height * 3);
  expect(scene.viewport.worldWidth).toEqual(dim.width * 3);

  scene.destroy();
  scene.viewport.destroy();
});
