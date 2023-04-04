<script lang="ts">
  import { getFocusedSequence, listenForFocusedSequenceUpdated } from "@lib/backend";
  import type { FocusedSequenceUpdatedPayload } from "@lib/bindings";
  import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "@lib/constants";
  import {
    DRAW_LETTER_THRESHOLD,
    DrawPoolGroup,
    PixiApplication,
    drawRect,
    drawText,
  } from "@lib/drawing/drawing";
  import type { DrawConfig } from "@lib/drawing/drawing";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import { onDestroy, onMount } from "svelte";

  export let splitId: string;
  export let widthPct: number;

  let canvasWidth: number;
  let canvasHeight: number;
  let canvas: HTMLDivElement;
  let drawPool: DrawPoolGroup | null = null;
  let sequence: string | null;
  const pixiApp = new PixiApplication();

  $: nucleotideColors = $USER_CONFIG_STORE!.styles.colors.nucleotideColors;
  $: canvasWidth, sequence, draw();

  const handleFocusedSequenceUpdated = (payload: FocusedSequenceUpdatedPayload): void => {
    if (payload.splitId === splitId) {
      console.log("Handling sequence update...");
      sequence = payload.sequence;
    }
  };

  const initPixiRenderer = (stage: Element): void => {
    pixiApp.resize({ width: canvasWidth, height: canvasHeight });
    stage.appendChild(pixiApp.renderer.view as HTMLCanvasElement);
  };

  const initStageManager = (): DrawPoolGroup => {
    const drawConfig: DrawConfig = {};
    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = nucleotideColors[nuc];
      drawConfig[nuc + "Rect"] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: 10, height: 15 },
          }),
        poolsize: 1000,
      };
      drawConfig[nuc + "Text"] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor, fontSize: 15 } }),
        poolsize: 100,
      };
    });
    SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = nucleotideColors[nuc];
      drawConfig[nuc + "Rect"] = {
        drawFn: () =>
          drawRect({
            color: nucColor,
            dim: { width: 10, height: 20 },
          }),
        poolsize: 10,
      };
      drawConfig[nuc + "Text"] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor, fontSize: 15 } }),
        poolsize: 10,
      };
    });
    return new DrawPoolGroup({ drawConfig, stage: pixiApp.stage });
  };

  const draw = () => {
    if (drawPool === null) {
      return;
    }
    LOG.debug("Redrawing RefSeqView...");
    drawPool.recycleAll();
    pixiApp.resize({ width: canvasWidth, height: canvasHeight });

    if (sequence === null) {
      return;
    }

    const nucWidth = canvasWidth / sequence.length;
    LOG.debug(
      `Redrawing RefSeqView with nucWidth=${nucWidth}, sequence.length=${sequence.length}, width=${canvasWidth}, height=${canvasHeight}`
    );
    for (let i = 0; i < sequence.length; i++) {
      let nuc = sequence.charAt(i);
      nuc = nuc !== "-" ? nuc : "GAP";
      const x = i * nucWidth;
      if (nucWidth > DRAW_LETTER_THRESHOLD) {
        drawPool.draw(nuc + "Text", {
          pos: { x, y: 0 },
        });
      } else {
        drawPool.draw(nuc + "Rect", {
          pos: { x, y: 0 },
          dim: { width: nucWidth, height: canvasHeight },
        });
      }
    }
  };

  onMount(async () => {
    getFocusedSequence(splitId).then((focusedSequence) => {
      initPixiRenderer(canvas);
      drawPool = initStageManager();
      sequence = focusedSequence;
      draw();
    });
  });

  onDestroy(async () => {
    pixiApp.destroy();
    LOG.debug("Destroyed RefSeqView PIXI application");
  });

  listenForFocusedSequenceUpdated((event) => handleFocusedSequenceUpdated(event.payload));
</script>

<div style:width={`${widthPct}%`} bind:offsetHeight={canvasHeight} bind:offsetWidth={canvasWidth}>
  <div bind:this={canvas} />
</div>
