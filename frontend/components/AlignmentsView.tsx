import { Box } from "@chakra-ui/react";
import * as PIXI from "pixi.js";
import { CSSProperties, ReactElement, memo, useContext, useRef } from "react";

import { AlignedPair, AlignedRead, AlignmentStack, PairedReads } from "../bindings";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { AlignmentsContext } from "../contexts/SplitGridContext";
import { drawTriangle, getNucTextStyle } from "../lib/drawing";
import { NUC_COLORS } from "../lib/drawing";
import { getLength } from "../lib/genomicCoordinates";
import { useElementSize, usePixiApp, usePixiStage } from "../lib/hooks";
import LOG from "../lib/logger";
import { RenderQueue } from "../lib/pixi-utils";
import { Point, Size } from "../lib/types";

const ALIGNMENT_COLOR = 0x969592;

const MISMATCH_TEXT_STYLE = getNucTextStyle();

const DRAW_LETTER_THRESHOLD = 200;
const MAX_ALIGNMENT_HEIGHT = 24;

/**
 * Area where alignments are rendered for a specific split within a specific track (i.e a cell in
 * the split grid).
 */
const AlignmentsView = memo(
  ({
    height,
    width,
    trackId,
    splitId,
    style,
  }: {
    height?: Size;
    width?: Size;
    trackId: string;
    splitId: string;
    readonly style: CSSProperties;
  }): ReactElement => {
    const refSeqContext = useContext(RefSeqContext);
    const alignmentsContext = useContext(AlignmentsContext);
    const ref = useElementSize<HTMLDivElement>();
    const pixiApp = usePixiApp({ ref });
    const renderQueue = useRef<RenderQueue>(new RenderQueue(pixiApp.stage));

    const drawForwardReadCap = ({
      pos,
      width,
      height,
    }: {
      pos: Point;
      width: number;
      height: number;
    }): PIXI.Graphics => {
      const cap = drawTriangle({
        vertices: [
          pos,
          { x: pos.x + width, y: pos.y + height / 2 },
          { x: pos.x, y: pos.y + height },
        ],
        color: ALIGNMENT_COLOR,
      });
      return cap;
    };

    const drawReverseReadCap = ({
      pos,
      width,
      height,
    }: {
      readonly pos: Point;
      width: number;
      height: number;
    }): PIXI.Graphics => {
      const cap = drawTriangle({
        vertices: [
          { x: pos.x + width, y: pos.y },
          { x: pos.x + width, y: pos.y + height },
          { x: pos.x, y: pos.y + height / 2 },
        ],
        color: ALIGNMENT_COLOR,
      });
      return cap;
    };

    const drawPairLine = ({
      pos,
      nucWidth,
      readHeight,
      alignment,
    }: {
      readonly pos: Point;
      nucWidth: number;
      readHeight: number;
      readonly alignment: PairedReads;
    }): PIXI.Graphics => {
      const pairLine = new PIXI.Graphics();
      const pairLineWidth =
        Number(BigInt(alignment.interval.end) - BigInt(alignment.interval.start)) * nucWidth;
      const pairLineX = pos.x >= 0 ? pos.x : 0;
      pairLine
        .beginFill(0x000000)
        .drawRect(pairLineX, pos.y + readHeight / 2 - 1, pairLineWidth, 2);
      return pairLine;
    };

    const drawDiffs = ({
      read,
      pos,
      height,
      nucWidth,
    }: {
      readonly read: AlignedRead;
      readonly pos: Point;
      height: number;
      nucWidth: number;
    }): void => {
      read.diffs.forEach((diff) => {
        switch (diff.type) {
          case "mismatch":
            const focusedRegion = refSeqContext[splitId].focusedRegion;
            if (focusedRegion === null) {
              break;
            }
            const diffX = pos.x + Number(diff.interval.start - focusedRegion.start) * nucWidth;
            if (getLength(focusedRegion) < DRAW_LETTER_THRESHOLD) {
              const pixiNuc = new PIXI.Text(diff.sequence, {
                ...MISMATCH_TEXT_STYLE,
                fill: NUC_COLORS[diff.sequence],
              });
              pixiNuc.x = diffX;
              pixiNuc.y = pos.y;
              renderQueue.current.render(pixiNuc);
            } else {
              const mismatch = new PIXI.Graphics();
              mismatch
                .beginFill(NUC_COLORS[diff.sequence])
                .drawRect(diffX, pos.y, nucWidth, height)
                .endFill();
              renderQueue.current.render(mismatch);
            }
            break;
          case "ins":
            break;
          case "del":
            break;
          case "softClip":
            break;
        }
      });
    };

    const drawRead = ({
      read,
      pos,
      height,
      nucWidth,
    }: {
      readonly read: AlignedRead;
      readonly pos: Point;
      height: number;
      nucWidth: number;
    }): void => {
      const width = Number(read.region.end - read.region.start) * nucWidth;

      const capWidth = 10;
      if (read.isReverse) {
        renderQueue.current.render(
          drawReverseReadCap({
            pos: { x: pos.x - capWidth, y: pos.y },
            width: capWidth,
            height,
          })
        );
      } else {
        renderQueue.current.render(
          drawForwardReadCap({
            pos: { x: pos.x + width - 1, y: pos.y },
            width: capWidth,
            height,
          })
        );
      }

      const pixiAlignment = new PIXI.Graphics();
      pixiAlignment.beginFill(ALIGNMENT_COLOR).drawRect(pos.x, pos.y, width, height).endFill();
      renderQueue.current.render(pixiAlignment);
      drawDiffs({ read, pos, height, nucWidth });
    };

    const drawAlignment = ({
      alignment,
      pos,
      nucWidth,
      height,
    }: {
      readonly alignment: AlignedPair;
      readonly pos: Point;
      nucWidth: number;
      height: number;
    }): void => {
      let reads;
      if (alignment.type == "pairedReadsKind") {
        reads = [alignment.read1, alignment.read2];
        renderQueue.current.render(drawPairLine({ pos, alignment, nucWidth, readHeight: height }));
      } else {
        reads = [alignment.read];
      }
      reads.forEach((read) => {
        if (read === null) {
          return;
        }
        let readX = pos.x + Number(read.region.start - alignment.interval.start) * nucWidth;
        if (readX < 0) {
          readX = 0;
        }
        drawRead({ read, pos: { x: readX, y: pos.y }, height, nucWidth });
      });
    };

    const getAlignments = (): AlignmentStack<AlignedPair> | null => {
      let alignments: AlignmentStack<AlignedPair> | null = null;
      if (
        trackId in alignmentsContext.alignments &&
        splitId in alignmentsContext.alignments[trackId]
      ) {
        alignments = alignmentsContext.alignments[trackId][splitId];
      }
      return alignments;
    };

    const draw = () => {
      LOG.debug("Redrawing AlignmentsView...");
      const currentRef = ref.current;
      if (currentRef === null) {
        return;
      }
      const alignments = getAlignments();
      if (alignments === null) {
        return;
      }
      const focusedRegion = refSeqContext[splitId].focusedRegion;
      if (focusedRegion === null) {
        LOG.debug("Null focusedRegion in AlignmentsView...");
        return;
      }
      renderQueue.current.clearStage();
      pixiApp.resize(currentRef.offsetWidth, currentRef.offsetHeight);

      const startPos = focusedRegion.start;
      const numNucs = Number(getLength(focusedRegion));
      const nucWidth = currentRef.offsetWidth / numNucs;
      const readHeight = Math.min(2 * nucWidth, MAX_ALIGNMENT_HEIGHT);
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
            drawAlignment({
              alignment,
              pos: { x, y },
              height: readHeight,
              nucWidth,
            });
          }
        });
        y += readHeight + 2;
      });
    };

    usePixiStage({ ref, draw });

    return (
      <Box className="alignments-view" width={width} height={height} ref={ref} style={style}></Box>
    );
  }
);

export default AlignmentsView;
