import { Box } from "@chakra-ui/react";
import { CSSProperties, ReactElement, memo, useContext, useRef } from "react";

import { AlignedPair, AlignedRead, AlignmentStack, PairedReads } from "../bindings";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { AlignmentsContext } from "../contexts/SplitGridContext";
import { UserConfigContext } from "../contexts/UserConfigContext";
import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "../lib/constants";
import {
  DRAW_LETTER_THRESHOLD,
  DrawConfig,
  StageManager,
  drawForwardReadCap,
  drawRect,
  drawReverseReadCap,
  drawText,
} from "../lib/drawing";
import { getLength } from "../lib/genomicCoordinates";
import { useElementSize, usePixiApp, usePixiStage } from "../lib/hooks";
import LOG from "../lib/logger";
import { Position, Size } from "../lib/types";

const MAX_ALIGNMENT_HEIGHT = 24;

const READ_BODY = "readBody";
const PAIR_LINE = "pairLine";
const FORWARD_READ_CAP = "forwardReadCap";
const REVERSE_READ_CAP = "reverseReadCap";
const NUC_RECT_SUFFIX = "SnvRect";
const NUC_TEXT_SUFFIX = "SnvText";

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
    const userConfigContext = useContext(UserConfigContext);
    const alignmentsContext = useContext(AlignmentsContext);
    const ref = useElementSize<HTMLDivElement>();
    const pixiApp = usePixiApp({ ref });

    const initStageManager = (): StageManager => {
      const drawConfig: DrawConfig = {};
      const alignmentColor = userConfigContext.styles.colors.alignment;
      drawConfig[PAIR_LINE] = {
        drawFn: () => drawRect({ color: 0x000000, dim: { width: 100, height: 2 } }),
        poolsize: 500,
      };
      drawConfig[READ_BODY] = {
        drawFn: () => drawRect({ color: alignmentColor }),
        poolsize: 500,
      };
      drawConfig[FORWARD_READ_CAP] = {
        drawFn: () => drawForwardReadCap({ color: alignmentColor }),
        poolsize: 250,
      };
      drawConfig[REVERSE_READ_CAP] = {
        drawFn: () => drawReverseReadCap({ color: alignmentColor }),
        poolsize: 250,
      };
      PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
        const nucColor = userConfigContext.styles.colors.nucleotideColors[nuc];
        drawConfig[nuc + NUC_RECT_SUFFIX] = {
          drawFn: () => drawRect({ color: nucColor, dim: { width: 10, height: 20 } }),
          poolsize: 200,
        };
        drawConfig[nuc + NUC_TEXT_SUFFIX] = {
          drawFn: () => drawText({ content: nuc, style: { tint: nucColor } }),
          poolsize: 50,
        };
      });
      SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
        const nucColor = userConfigContext.styles.colors.nucleotideColors[nuc];
        drawConfig[nuc + NUC_RECT_SUFFIX] = {
          drawFn: () => drawRect({ color: nucColor, dim: { width: 10, height: 20 } }),
          poolsize: 5,
        };
        drawConfig[nuc + NUC_TEXT_SUFFIX] = {
          drawFn: () => drawText({ content: nuc, style: { tint: nucColor } }),
          poolsize: 5,
        };
      });
      return new StageManager({ drawConfig, stage: pixiApp.stage });
    };

    const stageManager = useRef(initStageManager());

    const drawPairLine = ({
      pos,
      nucWidth,
      readHeight,
      alignment,
    }: {
      readonly pos: Position;
      nucWidth: number;
      readHeight: number;
      readonly alignment: PairedReads;
    }): void => {
      const linePos = { x: pos.x, y: pos.y + readHeight / 2 - 1 };
      const dim = {
        width: Number(alignment.interval.end - alignment.interval.start) * nucWidth,
        height: 2,
      };
      stageManager.current.draw(PAIR_LINE, { pos: linePos, dim });
    };

    const drawDiffs = ({
      read,
      pos,
      height,
      nucWidth,
    }: {
      readonly read: AlignedRead;
      readonly pos: Position;
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
            const diffX = Number(diff.interval.start - focusedRegion.start) * nucWidth;
            const nuc = diff.sequence !== "-" ? diff.sequence : "GAP";
            if (nucWidth > DRAW_LETTER_THRESHOLD) {
              stageManager.current.draw(nuc + NUC_TEXT_SUFFIX, {
                pos: { x: diffX, y: pos.y },
                fontSize: height - 2,
              });
            } else {
              stageManager.current.draw(nuc + NUC_RECT_SUFFIX, {
                pos: { x: diffX, y: pos.y },
                dim: { width: nucWidth, height },
              });
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
      readonly pos: Position;
      height: number;
      nucWidth: number;
    }): void => {
      const width = Number(read.region.end - read.region.start) * nucWidth;

      const capWidth = 10;
      if (read.isReverse) {
        stageManager.current.draw(REVERSE_READ_CAP, {
          pos: { x: pos.x - capWidth, y: pos.y },
          dim: { width: capWidth, height },
        });
      } else {
        stageManager.current.draw(FORWARD_READ_CAP, {
          pos: { x: pos.x + width - 1, y: pos.y },
          dim: { width: capWidth, height },
        });
      }

      stageManager.current.draw(READ_BODY, {
        pos,
        dim: { width, height },
      });
      drawDiffs({ read, pos, height, nucWidth });
    };

    const drawAlignment = ({
      alignment,
      pos,
      nucWidth,
      height,
    }: {
      readonly alignment: AlignedPair;
      readonly pos: Position;
      nucWidth: number;
      height: number;
    }): void => {
      let reads;
      if (alignment.type == "pairedReadsKind") {
        reads = [alignment.read1, alignment.read2];
        drawPairLine({ pos, alignment, nucWidth, readHeight: height });
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
      stageManager.current.recycleAll();
      const startPos = focusedRegion.start;
      const numNucs = Number(getLength(focusedRegion));
      const nucWidth = currentRef.offsetWidth / numNucs;
      const readHeight = Math.min(2 * nucWidth, MAX_ALIGNMENT_HEIGHT);
      const rowHeight = readHeight + 2;

      pixiApp.resize(currentRef.offsetWidth, rowHeight * alignments.rows.length);

      LOG.debug(
        `Redrawing AlignmentsView with nucWidth=${nucWidth}, numNucs=${numNucs}, region=${JSON.stringify(
          focusedRegion
        )}, width=${currentRef.offsetWidth}, height=${currentRef.offsetHeight}`
      );
      let y = 0;
      alignments.rows.forEach((row) => {
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
        y += rowHeight;
      });
    };

    usePixiStage({ ref, draw });

    return (
      <Box
        className="alignments-view"
        width={width}
        height={height}
        ref={ref}
        style={style}
        overflow="scroll"
      ></Box>
    );
  }
);

export default AlignmentsView;
