import { Box } from "@chakra-ui/react";
import * as PIXI from "pixi.js";
import { ReactElement, useContext, useEffect, useRef } from "react";

import { RefSeqContext } from "../contexts/RefSeqContext";
import { useElementSize, usePixiApp, usePixiStage } from "../hooks";
import { getNucTextStyle } from "../lib/drawing";
import { NUC_COLORS } from "../lib/drawing";
import { getLength } from "../lib/genomicCoordinates";
import LOG from "../lib/logger";
import { RenderQueue } from "../lib/pixi-utils";
import { Size } from "../lib/types";

const DRAW_LETTER_THRESHOLD = 200;

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
  const ref = useElementSize<HTMLDivElement>();
  const pixiApp = usePixiApp({ ref });
  const renderQueue = useRef<RenderQueue>(new RenderQueue(pixiApp.stage));

  const drawBlankFiller = ({ width, height }: { width: number; height: number }) => {
    const filler = new PIXI.Graphics();
    filler.beginFill(0x808080).drawRect(0, 0, width, height);
    renderQueue.current.render(filler);
  };

  const drawNucLetter = ({
    nuc,
    x,
    width,
    style,
  }: {
    nuc: string;
    x: number;
    width: number;
    readonly style: PIXI.TextStyle;
  }): void => {
    const pixiNuc = new PIXI.Text(nuc, { ...style, fill: NUC_COLORS[nuc] });
    pixiNuc.x = x;
    renderQueue.current.render(pixiNuc);
  };

  const drawNucRect = ({
    nuc,
    x,
    width,
    height,
  }: {
    nuc: string;
    x: number;
    width: number;
    height: number;
  }): void => {
    const rect = new PIXI.Graphics();
    rect.beginFill(NUC_COLORS[nuc]).drawRect(x, 0, width, height);
    renderQueue.current.render(rect);
  };

  const draw = () => {
    LOG.debug("Redrawing RefSeqView...");
    if (ref.current === null) {
      return;
    }
    renderQueue.current.clearStage();
    pixiApp.resize(ref.current.offsetWidth, ref.current.offsetHeight);
    const splitContext = refSeqContext[splitId];
    if (splitContext.focusedRegion === null) {
      LOG.debug("Null focusedRegion in RefSeqView...");
      drawBlankFiller({
        width: ref.current.offsetWidth,
        height: ref.current.offsetHeight,
      });
      return;
    }

    const numNucs = Number(getLength(splitContext.focusedRegion));

    if (numNucs > 10000) {
      drawBlankFiller({
        width: ref.current.offsetWidth,
        height: ref.current.offsetHeight,
      });
      return;
    }

    let style = getNucTextStyle();

    const nucWidth = ref.current.offsetWidth / numNucs;
    LOG.debug(
      `Redrawing RefSeqView with nucWidth=${nucWidth}, numNucs=${numNucs}, region=${JSON.stringify(
        splitContext.focusedRegion
      )}, width=${ref.current.offsetWidth}, height=${ref.current.offsetHeight}`
    );
    for (let i = 0; i < getLength(splitContext.focusedRegion); i++) {
      const nuc = splitContext.sequence.charAt(i);
      style.stroke = NUC_COLORS[nuc];
      const x = i * nucWidth;
      if (numNucs < DRAW_LETTER_THRESHOLD) {
        drawNucLetter({ nuc, x, width: nucWidth, style });
      } else {
        drawNucRect({
          nuc,
          x,
          width: nucWidth,
          height: ref.current.offsetHeight,
        });
      }
    }
  };

  usePixiStage({ ref, draw });

  return <Box className="ref-seq" ref={ref} height={height} width={width}></Box>;
};

export default RefSeqView;
