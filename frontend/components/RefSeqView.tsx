import { Box } from "@chakra-ui/react";
import * as PIXI from "pixi.js";
import { ReactElement, useContext, useEffect, useRef } from "react";

import { NucleotideColorConfig } from "../bindings";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { UserConfigContext } from "../contexts/UserConfigContext";
import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "../lib/constants";
import {
  DRAW_LETTER_THRESHOLD,
  DrawConfig,
  StageManager,
  drawRect,
  drawText,
} from "../lib/drawing";
import { getLength } from "../lib/genomicCoordinates";
import { useElementSize, usePixiApp, usePixiStage } from "../lib/hooks";
import LOG from "../lib/logger";
import { IUPACNucleotide, Size } from "../lib/types";

const RefSeqView = ({
  height,
  width,
  splitId,
}: {
  height: Size;
  width: Size;
  splitId: string;
}): ReactElement => {
  const refSeqContext = useContext(RefSeqContext);
  const userConfigContext = useContext(UserConfigContext);
  const ref = useElementSize<HTMLDivElement>();
  const pixiApp = usePixiApp({ ref });

  const initStageManager = (): StageManager => {
    const drawConfig: DrawConfig = {};
    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = userConfigContext.styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + "Rect"] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: 10, height: 20 },
          }),
        poolsize: 1000,
      };
      drawConfig[nuc + "Text"] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor } }),
        poolsize: 100,
      };
    });
    SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = userConfigContext.styles.colors.nucleotideColors[nuc];
      drawConfig[nuc + "Rect"] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: 10, height: 20 },
          }),
        poolsize: 10,
      };
      drawConfig[nuc + "Text"] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor } }),
        poolsize: 10,
      };
    });
    return new StageManager({ drawConfig, stage: pixiApp.stage });
  };

  const stageManager = useRef(initStageManager());

  const draw = () => {
    LOG.debug("Redrawing RefSeqView...");
    if (ref.current === null) {
      return;
    }
    stageManager.current.recycleAll();
    pixiApp.resize(ref.current.offsetWidth, ref.current.offsetHeight);
    const splitContext = refSeqContext[splitId];
    if (splitContext.focusedRegion === null) {
      LOG.debug("Null focusedRegion in RefSeqView...");
      return;
    }

    const numNucs = Number(getLength(splitContext.focusedRegion));

    if (numNucs > 10000) {
      return;
    }

    const nucWidth = ref.current.offsetWidth / numNucs;
    LOG.debug(
      `Redrawing RefSeqView with nucWidth=${nucWidth}, numNucs=${numNucs}, region=${JSON.stringify(
        splitContext.focusedRegion
      )}, width=${ref.current.offsetWidth}, height=${ref.current.offsetHeight}`
    );
    for (let i = 0; i < getLength(splitContext.focusedRegion); i++) {
      let nuc = splitContext.sequence.charAt(i);
      nuc = nuc !== "-" ? nuc : "GAP";
      const x = i * nucWidth;
      if (nucWidth > DRAW_LETTER_THRESHOLD) {
        stageManager.current.draw(nuc + "Text", {
          pos: { x, y: 0 },
        });
      } else {
        stageManager.current.draw(nuc + "Rect", {
          pos: { x, y: 0 },
          dim: { width: nucWidth, height: ref.current.offsetHeight },
        });
      }
    }
  };

  usePixiStage({ ref, draw });

  return <Box className="ref-seq" ref={ref} height={height} width={width}></Box>;
};

export default RefSeqView;
