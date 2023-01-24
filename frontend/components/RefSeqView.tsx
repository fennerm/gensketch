import { Box } from "@chakra-ui/react";
import { useEventListener } from "@chakra-ui/react";
import { render } from "@inlet/react-pixi";
import * as PIXI from "pixi.js";
import { ReactElement, useContext, useEffect, useRef, useState } from "react";

import { RefSeqContext } from "../contexts/RefSeqContext";
import { useElementSize } from "../hooks";
import { PixiApplication } from "../lib/PixiApplication";
import { getLength } from "../lib/genomicCoordinates";
import LOG from "../lib/logger";

interface NucColors {
  [nuc: string]: number;
}

const NUC_COLORS: NucColors = {
  A: 0xff0000, // red
  C: 0x0000ff, // blue
  G: 0x00ff00, // green
  T: 0xa020f0, // purple
  N: 0x808080, // grey
};

// https://medium.com/thinknum/writing-high-performance-react-pixi-code-c8c75414020b
// Actually just use raw pixi - https://www.reddit.com/r/javascript/comments/9ev209/there_seems_to_be_2_libraries_to_use_pixi_with/
const RefSeqView = ({
  height,
  width,
  splitId,
}: {
  height: string | number;
  width: string | number;
  splitId: string;
}): ReactElement => {
  const refSeqContext = useContext(RefSeqContext);
  const ref = useElementSize<HTMLDivElement>();
  const [pixiApp, setPixiApp] = useState(() => new PixiApplication({ backgroundColor: 0xffffff }));
  const renderedGraphics = useRef<PIXI.Graphics[]>([]);

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

  const drawBlankFiller = ({
    stage,
    width,
    height,
  }: {
    stage: PIXI.Container;
    width: number;
    height: number;
  }) => {
    const filler = new PIXI.Graphics();
    filler.beginFill(0x808080).drawRect(0, 0, width, height);
    stage.addChild(filler);
    renderedGraphics.current = [filler];
  };

  const drawNucLetter = ({
    nuc,
    stage,
    x,
    width,
    style,
  }: {
    nuc: string;
    stage: PIXI.Container;
    x: number;
    width: number;
    style: PIXI.TextStyle;
  }): void => {
    const pixiNuc = new PIXI.Text(nuc, { ...style, fill: NUC_COLORS[nuc] });
    pixiNuc.x = x;
    stage.addChild(pixiNuc);
  };

  const drawNucRect = ({
    nuc,
    stage,
    x,
    width,
    height,
  }: {
    nuc: string;
    stage: PIXI.Container;
    x: number;
    width: number;
    height: number;
  }): void => {
    const rect = new PIXI.Graphics();
    rect.beginFill(NUC_COLORS[nuc]).drawRect(x, 0, width, height);
    stage.addChild(rect);
    renderedGraphics.current.push(rect);
  };

  const draw = () => {
    LOG.debug("Redrawing RefSeqView...");
    if (ref.current === null) {
      return;
    }
    renderedGraphics.current.forEach((obj) => obj.destroy());
    pixiApp.stage.removeChildren();
    const splitContext = refSeqContext[splitId];
    if (splitContext.focusedRegion === null) {
      LOG.debug("Null focusedRegion in RefSeqView...");
      drawBlankFiller({
        width: ref.current.offsetWidth,
        height: ref.current.offsetHeight,
        stage: pixiApp.stage,
      });
      return;
    }

    const numNucs = Number(getLength(splitContext.focusedRegion));

    if (numNucs > 1000) {
      drawBlankFiller({
        width: ref.current.offsetWidth,
        height: ref.current.offsetHeight,
        stage: pixiApp.stage,
      });
      return;
    }

    let style = new PIXI.TextStyle({
      align: "center",
      fontFamily: "monospace",
      fontSize: 18,
    });

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
      renderedGraphics.current = [];
      if (numNucs < 200) {
        drawNucLetter({ nuc, stage: pixiApp.stage, x, width: nucWidth, style });
      } else {
        drawNucRect({
          nuc,
          stage: pixiApp.stage,
          x,
          width: nucWidth,
          height: ref.current.offsetHeight,
        });
      }
    }
  };

  const handleResize = (): void => {
    LOG.debug("RefSeqView detected resize...");
    if (ref.current !== null) {
      pixiApp.resize(ref.current.offsetWidth, ref.current.offsetHeight);
      draw();
    }
  };

  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return <Box className="ref-seq" ref={ref} height={height} width={width}></Box>;
};

export default RefSeqView;
