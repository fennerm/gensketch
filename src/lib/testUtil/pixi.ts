// I wasn't able to get unit tests to work with PIXI. Leaving this file here to document what I tried.
// 1. jest-webgl-canvas-mock - Lead to errors in code which imports pixi-viewport
// 2. floss + mocha - Floss ran but never produced any output
// 3. jest-electron-runner - Couldn't figure out how to get it to work with ts-jest/ESM modules.

export default {};

// /**
//  * @jest-environment jsdom
//  */

// import { jest } from "@jest/globals";
// import { fakeUserConfig } from "../testUtil/fixtures";
// import { AlignedReadsScene } from "./AlignedReadsScene";

// // jest.unstable_mockModule("pixi.js", () => ({
// //   BitmapText: jest.fn((text, style) => Promise.resolve(new PIXI.Text())),
// // }));

// test("viewport initialization", async () => {
//   document.body.innerHTML = '<div class="alignments-canvas"></div>';
//   const canvas = document.getElementsByClassName("alignments-canvas")[0] as HTMLDivElement;
//   const styles = fakeUserConfig().styles;
//   const dim = { width: 800, height: 600 };
//   const scene = new AlignedReadsScene({
//     dim,
//     handleClick: () => {},
//     canvas,
//     styles,
//   });
//   expect(scene.viewport.screenWidth).toEqual(dim.width);
//   expect(scene.viewport.screenHeight).toEqual(dim.height);
//   expect(scene.viewport.worldHeight).toEqual(dim.height * 3);
//   expect(scene.viewport.worldWidth).toEqual(dim.width * 3);

//   scene.destroy();
//   scene.viewport.destroy();
// });
