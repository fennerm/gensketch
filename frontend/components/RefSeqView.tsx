import { Box } from "@chakra-ui/react";
import { ReactElement, RefObject, useContext, useEffect, useRef, useState } from "react";

import { RefSeqContext } from "../contexts/RefSeqContext";
import GenomicRegion from "../lib/GenomicRegion";

const NUC_COLORS = {
  A: "red",
  C: "blue",
  G: "green",
  T: "purple",
  N: "grey",
};

const RefSeqView = ({
  height,
  width,
}: {
  height: string | number;
  width: string | number;
}): ReactElement => {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const context = useContext(RefSeqContext);

  const draw = (element: HTMLCanvasElement) => {
    const canvas = element.getContext("2d");
    if (canvas === null || boxRef.current === null) {
      return;
    }
    console.log(`Redrawing. New width: ${boxRef.current.offsetWidth}`);

    element.width = boxRef.current.offsetWidth;
    element.height = boxRef.current.offsetHeight;
    const numNucs = context.focusedRegion.length();
    const nucWidth = element.width / numNucs;
    canvas.clearRect(0, 0, element.width, element.height);
    canvas.font = "18px sans";
    canvas.textAlign = "center";

    if (numNucs > 1000) {
      canvas.fillStyle = "grey";
      canvas.fillRect(0, 0, element.width, element.height);
      return;
    }

    for (let i = 0; i < context.focusedRegion.length(); i++) {
      let nuc = context.sequence.charAt(i);
      canvas.fillStyle = NUC_COLORS[nuc];
      if (numNucs < 200) {
        canvas.fillText(nuc, i * nucWidth, element.height, nucWidth);
      } else {
        canvas.fillRect(i * nucWidth, 0, nucWidth, element.height);
      }
    }
  };

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    draw(canvasRef.current);
  });

  return (
    <Box className="ref-seq" ref={boxRef} height={height} width={width}>
      <canvas ref={canvasRef}></canvas>
    </Box>
  );
};

export default RefSeqView;
