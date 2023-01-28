import { Point } from "framer-motion";
import * as PIXI from "pixi.js";

export type TriangleVertices = [Point, Point, Point];

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

export interface NucColors {
  [nuc: string]: number;
}

export const NUC_COLORS: NucColors = {
  A: 0xff0000, // red
  C: 0x0000ff, // blue
  G: 0x00ff00, // green
  T: 0xa020f0, // purple
  N: 0x808080, // grey
};

export const getNucTextStyle = (): PIXI.TextStyle => {
  return new PIXI.TextStyle({
    align: "center",
    fontFamily: "monospace",
    fontSize: 24,
  });
};
