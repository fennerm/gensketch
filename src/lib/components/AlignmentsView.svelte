<script lang="ts">
  import {
    getAlignments,
    getFocusedRegion,
    listenForAlignmentsUpdateQueued,
    listenForAlignmentsUpdated,
  } from "@lib/backend";
  import type {
    AlignedPair,
    AlignedRead,
    AlignmentStackKind,
    AlignmentsUpdatedPayload,
    GenomicRegion,
    PairedReads,
  } from "@lib/bindings";
  import { PRIMARY_IUPAC_NUCLEOTIDES, SECONDARY_IUPAC_NUCLEOTIDES } from "@lib/constants";
  import {
    DRAW_LETTER_THRESHOLD,
    DrawPoolGroup,
    PixiApplication,
    drawRect,
    drawText,
    drawTriangle,
    updateIfChanged,
  } from "@lib/drawing";
  import type { DrawConfig } from "@lib/drawing";
  import { getLength } from "@lib/genomicCoordinates";
  import { to0IndexedString } from "@lib/genomicCoordinates";
  import LOG from "@lib/logger";
  import { USER_CONFIG_STORE } from "@lib/stores/UserConfigStore";
  import type { Dimensions, Position } from "@lib/types";
  import * as PIXI from "pixi.js";
  import { onDestroy, onMount } from "svelte";

  export let trackId: string;
  export let splitId: string;
  export let widthPct: number;

  const maxAlignmentHeight = 24;
  const readBody = "readBody";
  const pairLine = "pairLine";
  const forwardReadCap = "forwardReadCap";
  const reverseReadCap = "reverseReadCap";
  const nucRectSuffix = "SnvRect";
  const nucTextSuffix = "SnvText";
  const defaultReadHeight = 10;
  const defaultReadWidth = 100;
  const defaultCapWidth = 10;
  const defaultPairLineHeight = 1;
  const defaultPairLineWidth = 100;
  const defaultNucWidth = defaultCapWidth;

  let viewWidth: number;
  let viewHeight: number;
  let stage: HTMLDivElement;
  let stageManager: DrawPoolGroup;
  const pixiApp = new PixiApplication();
  let focusedRegion: GenomicRegion | null = null;
  let alignments: AlignmentStackKind | null = null;
  $: colorConfig = $USER_CONFIG_STORE!.styles.colors;
  $: viewWidth, alignments, draw();

  const initReadCapTexture = (): PIXI.RenderTexture => {
    const texture = PIXI.RenderTexture.create({
      width: defaultCapWidth,
      height: defaultReadHeight,
      multisample: PIXI.MSAA_QUALITY.HIGH,
      resolution: window.devicePixelRatio,
    });
    return texture;
  };

  const forwardReadCapTexture = initReadCapTexture();
  const reverseReadCapTexture = initReadCapTexture();

  const handleAlignmentsUpdated = (payload: AlignmentsUpdatedPayload): void => {
    if (splitId === payload.splitId && trackId === payload.trackId) {
      LOG.debug(
        `Handling alignments update (focusedRegion=${to0IndexedString(
          payload.focusedRegion
        )}, rows=${payload.alignments.rows.length})...`
      );
      focusedRegion = payload.focusedRegion;
      alignments = payload.alignments;
    }
  };

  listenForAlignmentsUpdated((event) => handleAlignmentsUpdated(event.payload));
  listenForAlignmentsUpdateQueued((event) => handleAlignmentsUpdated(event.payload));

  const loadTextures = (): void => {
    const forwardReadCapTemplate = drawTriangle({
      vertices: [
        { x: 0, y: 0 },
        { x: defaultCapWidth, y: defaultReadHeight / 2 },
        { x: 0, y: defaultReadHeight },
      ],
      color: 0xffffff,
    });
    pixiApp.loadRenderTexture({ shape: forwardReadCapTemplate, texture: forwardReadCapTexture });
    const reverseReadCapTemplate = drawTriangle({
      vertices: [
        { x: defaultCapWidth, y: 0 },
        { x: defaultCapWidth, y: defaultReadHeight },
        { x: 0, y: defaultReadHeight / 2 },
      ],
      color: 0xffffff,
    });

    pixiApp.loadRenderTexture({ shape: reverseReadCapTemplate, texture: reverseReadCapTexture });

    // Required for MSAA, WebGL 2 only
    pixiApp.renderer.framebuffer.blit();
  };

  export const drawReadCap = ({
    texture,
    pos,
    dim,
    color,
  }: {
    texture: PIXI.RenderTexture;
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
  }): PIXI.Sprite => {
    pos = pos === undefined ? { x: 0, y: 0 } : pos;
    dim = dim === undefined ? { width: defaultCapWidth, height: defaultReadHeight } : dim;
    const cap = new PIXI.Sprite(texture);
    cap.setTransform();
    if (color !== undefined) {
      cap.tint = color;
    }
    updateIfChanged({ container: cap, pos, dim });
    return cap;
  };

  export const drawForwardReadCap = ({
    pos,
    dim,
    color,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
  }): PIXI.Sprite => {
    return drawReadCap({ texture: forwardReadCapTexture, pos, dim, color });
  };

  export const drawReverseReadCap = ({
    pos,
    dim,
    color,
  }: {
    readonly pos?: Position;
    readonly dim?: Dimensions;
    color?: number;
  }): PIXI.Sprite => {
    return drawReadCap({ texture: reverseReadCapTexture, pos, dim, color });
  };

  const initPixiRenderer = (stage: Element): void => {
    pixiApp.resize(viewWidth, viewHeight);
    stage.appendChild(pixiApp.renderer.view);
  };

  const initDrawPools = (): DrawPoolGroup => {
    const drawConfig: DrawConfig = {};
    const alignmentColor = colorConfig.alignment;
    drawConfig[pairLine] = {
      drawFn: () =>
        drawRect({
          color: 0x000000,
          dim: { width: defaultPairLineWidth, height: defaultPairLineHeight },
        }),
      poolsize: 500,
    };
    drawConfig[readBody] = {
      drawFn: () => drawRect({ color: alignmentColor }),
      poolsize: 500,
    };
    drawConfig[forwardReadCap] = {
      drawFn: () => drawForwardReadCap({ color: alignmentColor }),
      poolsize: 250,
    };
    drawConfig[reverseReadCap] = {
      drawFn: () => drawReverseReadCap({ color: alignmentColor }),
      poolsize: 250,
    };
    PRIMARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = colorConfig.nucleotideColors[nuc];
      drawConfig[nuc + nucRectSuffix] = {
        drawFn: () =>
          drawRect({ color: nucColor, dim: { width: defaultNucWidth, height: defaultReadHeight } }),
        poolsize: 200,
      };
      drawConfig[nuc + nucTextSuffix] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor } }),
        poolsize: 50,
      };
    });
    SECONDARY_IUPAC_NUCLEOTIDES.forEach((nuc) => {
      const nucColor = colorConfig.nucleotideColors[nuc];
      drawConfig[nuc + nucRectSuffix] = {
        drawFn: () =>
          drawRect({ color: nucColor, dim: { width: defaultNucWidth, height: defaultReadHeight } }),
        poolsize: 5,
      };
      drawConfig[nuc + nucTextSuffix] = {
        drawFn: () => drawText({ content: nuc, style: { tint: nucColor } }),
        poolsize: 5,
      };
    });
    return new DrawPoolGroup({ drawConfig, stage: pixiApp.stage });
  };

  onMount(async () => {
    loadTextures();
    Promise.all([getAlignments({ trackId, splitId }), getFocusedRegion(splitId)]).then((values) => {
      alignments = values[0];
      focusedRegion = values[1];
      initPixiRenderer(stage);
      stageManager = initDrawPools();
    });
  });

  onDestroy(async () => {
    pixiApp.destroy();
  });

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
    const linePos = { x: pos.x, y: pos.y + readHeight / 2 };
    const dim = {
      width: Number(alignment.interval.end - alignment.interval.start) * nucWidth,
      height: 0.5,
    };
    stageManager.draw(pairLine, { pos: linePos, dim });
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
        case "mismatch": {
          const diffX = Number(diff.interval.start - focusedRegion!.interval.start) * nucWidth;
          const nuc = diff.sequence !== "-" ? diff.sequence : "GAP";
          if (nucWidth > DRAW_LETTER_THRESHOLD) {
            stageManager.draw(nuc + nucTextSuffix, {
              pos: { x: diffX, y: pos.y },
              fontSize: height - 2,
            });
          } else {
            stageManager.draw(nuc + nucRectSuffix, {
              pos: { x: diffX, y: pos.y },
              dim: { width: nucWidth, height },
            });
          }
          break;
        }
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
    const width = Number(read.region.interval.end - read.region.interval.start) * nucWidth;

    const capWidth = 5;
    if (read.isReverse) {
      stageManager.draw(reverseReadCap, {
        pos: { x: pos.x - capWidth, y: pos.y },
        dim: { width: capWidth, height },
      });
    } else {
      stageManager.draw(forwardReadCap, {
        pos: { x: pos.x + width - 1, y: pos.y },
        dim: { width: capWidth, height },
      });
    }

    stageManager.draw(readBody, {
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
      let readX = pos.x + Number(read.region.interval.start - alignment.interval.start) * nucWidth;
      if (readX < 0) {
        readX = 0;
      }
      try {
        drawRead({ read, pos: { x: readX, y: pos.y }, height, nucWidth });
      } catch {
        LOG.warn(JSON.stringify(read));
      }
    });
  };

  const draw = () => {
    if (alignments === null || focusedRegion === null) {
      return;
    }
    LOG.debug("Redrawing AlignmentsView...");
    stageManager.recycleAll();
    const startPos = focusedRegion.interval.start;
    const numNucs = Number(getLength(focusedRegion.interval));
    const nucWidth = viewWidth / numNucs;
    const readHeight = Math.min(2 * nucWidth, maxAlignmentHeight);
    const rowHeight = readHeight + 2;

    pixiApp.resize(viewWidth, rowHeight * alignments.rows.length);

    LOG.debug(
      `Redrawing AlignmentsView with nucWidth=${nucWidth}, numNucs=${numNucs}, region=${JSON.stringify(
        focusedRegion
      )}, width=${viewWidth}, height=${viewHeight}`
    );
    let y = 0;
    alignments.rows.forEach((row) => {
      row.forEach((alignment) => {
        if (
          alignment.interval.start <= focusedRegion!.interval.end &&
          alignment.interval.end >= focusedRegion!.interval.start
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
</script>

<div
  class="alignments-view"
  style:width={`${widthPct}%`}
  bind:offsetHeight={viewHeight}
  bind:offsetWidth={viewWidth}
>
  <div bind:this={stage} />
</div>

<style>
  .alignments-view {
    height: 100%;
  }
</style>
