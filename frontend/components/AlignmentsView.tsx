import { Box, Flex } from "@chakra-ui/react";
import * as PIXI from "pixi.js";
import { Graphics } from "pixi.js";
import { ReactElement, useContext, useEffect, useMemo, useRef, useState } from "react";

import { AlignedPair, AlignmentStack } from "../bindings";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { AlignmentsContext } from "../contexts/SplitGridContext";
import { useElementSize, usePixiApp } from "../hooks";
import { PixiApplication } from "../lib/PixiApplication";
import { getLength } from "../lib/genomicCoordinates";
import LOG from "../lib/logger";

/**
 * Area where alignments are rendered for a specific split within a specific track (i.e a cell in
 * the split grid).
 */
const AlignmentsView = ({
  height,
  width,
  trackId,
  splitId,
}: {
  height: string;
  width: string;
  trackId: string;
  splitId: string;
}): ReactElement => {
  const refSeqContext = useContext(RefSeqContext);
  const alignmentsContext = useContext(AlignmentsContext);
  const ref = useElementSize<HTMLDivElement>();
  const [pixiApp, setPixiApp] = useState(() => new PixiApplication({ backgroundColor: 0xffffff }));
  const renderedGraphics = useRef<PIXI.Graphics[]>([]);

  const alignments = useMemo(() => {
    let alignments: AlignmentStack<AlignedPair> | null = null;
    if (
      trackId in alignmentsContext.alignments &&
      splitId in alignmentsContext.alignments[trackId]
    ) {
      alignments = alignmentsContext.alignments[trackId][splitId];
    }
    return alignments;
  }, [alignmentsContext.alignments]);

  useEffect(() => {
    if (ref.current === null) {
      return;
    }
    pixiApp.resize(ref.current.offsetWidth, ref.current.offsetHeight);
    ref.current.appendChild(pixiApp.renderer.view);

    return () => {
      pixiApp.destroy();
    };
  }, []);

  useEffect(() => {
    draw();
  });

  const drawAlignment = ({
    stage,
    alignment,
    x,
    y,
    nucWidth,
  }: {
    stage: PIXI.Container;
    alignment: AlignedPair;
    x: number;
    y: number;
    nucWidth: number;
  }): void => {
    let reads;
    let toRender = [];
    if (alignment.type == "pairedReadsKind") {
      reads = [alignment.read1, alignment.read2];
      const pairLine = new PIXI.Graphics();
      const pairLineWidth =
        Number(BigInt(alignment.interval.end) - BigInt(alignment.interval.start)) * nucWidth;
      const pairLineX = x >= 0 ? x : 0;
      pairLine.beginFill(0x000000).drawRect(x, y + nucWidth - 1, pairLineWidth, 2);
      toRender.push(pairLine);
    } else {
      reads = [alignment.read];
    }
    reads.forEach((read) => {
      if (read === null) {
        return;
      }
      const width = Number(read.region.end - read.region.start) * nucWidth;
      const pixiAlignment = new PIXI.Graphics();
      let readX = x + Number(read.region.start - alignment.interval.start) * nucWidth;
      if (readX < 0) {
        readX = 0;
      }

      pixiAlignment
        .beginFill(0x969592)
        .drawRect(x, y, width, 2 * nucWidth)
        .endFill();
      toRender.push(pixiAlignment);
    });
    renderedGraphics.current = toRender;
    stage.addChild(...toRender);
  };

  const draw = () => {
    LOG.debug("Redrawing AlignmentsView...");
    let alignments: AlignmentStack<AlignedPair> | null = null;
    if (
      trackId in alignmentsContext.alignments &&
      splitId in alignmentsContext.alignments[trackId]
    ) {
      alignments = alignmentsContext.alignments[trackId][splitId];
    }
    if (alignments === null || ref.current === null) {
      return;
    }
    const stage = pixiApp.stage;
    const currentRef = ref.current;
    const focusedRegion = refSeqContext[splitId].focusedRegion;
    if (focusedRegion === null) {
      LOG.debug("Null focusedRegion in AlignmentsView...");
      return;
    }
    renderedGraphics.current.forEach((obj) => obj.destroy());
    stage.removeChildren();

    const startPos = focusedRegion.start;
    const numNucs = Number(getLength(focusedRegion));
    const nucWidth = currentRef.offsetWidth / numNucs;
    LOG.debug(
      `Redrawing AlignmentsView with nucWidth=${nucWidth}, numNucs=${numNucs}, region=${JSON.stringify(
        focusedRegion
      )}, width=${currentRef.offsetWidth}, height=${currentRef.offsetHeight}`
    );
    let y = 0;
    alignments.rows.forEach((row) => {
      if (y > currentRef.offsetHeight) {
        return;
      }
      row.forEach((alignment) => {
        if (
          alignment.interval.start <= focusedRegion.end &&
          alignment.interval.end >= focusedRegion.start
        ) {
          const x = Number(BigInt(alignment.interval.start) - startPos) * nucWidth;
          drawAlignment({ stage: pixiApp.stage, alignment, x, y, nucWidth });
        }
      });
      y += 2 * nucWidth + 2;
    });
  };

  const handleResize = (): void => {
    LOG.debug("AlignmentsView detected resize...");
    if (ref.current !== null) {
      pixiApp.resize(ref.current.offsetWidth, ref.current.offsetHeight);
      // draw();
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <Box width={width} height={height} ref={ref}></Box>;
};

export default AlignmentsView;
