import { Box, Flex } from "@chakra-ui/react";
import { ReactElement, useEffect, useRef, useState } from "react";

import { AlignmentTrackData } from "../bindings";
import { SplitData } from "../bindings";
import { listenForSplitAdded, listenForTrackAdded } from "../lib/backend";
import { DIVIDER_PX } from "../lib/constants";
import { loadPixiAssets } from "../lib/drawing";
import { useBackendListener } from "../lib/hooks";
import LOG from "../lib/logger";
import { Size } from "../lib/types";
import ErrorBoundary from "./ErrorBoundary";
import { GridDivider } from "./GridDivider";
import RefSeqArea from "./RefSeqArea";
import SplitToolbar from "./SplitToolbar";
import Track, { SplitState } from "./Track";

const REF_SEQ_HEIGHT = "24px";
const SPLIT_TOOLBAR_HEIGHT = "50px";

interface TrackState {
  id: string;
  heightPct: number;
  name: string;
}

const SplitGrid = ({ height, width }: { height: Size; width: Size }): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [splits, setSplits] = useState<SplitState[]>([]);

  useEffect(() => {
    loadPixiAssets().load(() => setAssetsLoaded(true));
  }, []);

  const addTrack = (newTrack: AlignmentTrackData): void => {
    LOG.debug(`Handling track-added event: ${JSON.stringify(newTrack)}`);
    setTracks((state) => {
      LOG.debug("setTracks called...");
      const numTracks = state.length;
      const newTrackHeight = 100 / (numTracks + 1);
      state.map((track) => {
        track.heightPct = track.heightPct - newTrackHeight / numTracks;
      });
      const newTrackState: TrackState = {
        ...newTrack,
        heightPct: newTrackHeight,
      };
      state.push(newTrackState);
      LOG.debug(`Updating UI with new track: ${JSON.stringify(newTrackState)}`);
      return [...state];
    });
  };

  const addSplit = (newSplit: SplitData): void => {
    setSplits((state) => {
      LOG.debug(`Handling spit-added event: ${JSON.stringify(newSplit)}`);
      const numSplits = state.length;
      const newSplitWidth = 100 / (numSplits + 1);
      state.map((split) => {
        split.widthPct = split.widthPct - newSplitWidth / numSplits;
      });
      const newSplitState: SplitState = {
        id: newSplit.id,
        widthPct: newSplitWidth,
        focusedRegion: newSplit.focusedRegion,
      };
      LOG.debug(`Updating UI with new split: ${JSON.stringify(newSplitState)}`);
      state.push(newSplitState);
      return [...state];
    });
  };

  useBackendListener(listenForTrackAdded, (event) => addTrack(event.payload));
  useBackendListener(listenForSplitAdded, (event) => addSplit(event.payload));

  return (
    <>
      {assetsLoaded && (
        <Box className="split-grid" ref={ref} height={height} width={width}>
          <RefSeqArea height={REF_SEQ_HEIGHT} width="full" splitGridRef={ref} />
          <Flex width="full" height={SPLIT_TOOLBAR_HEIGHT} flexDirection="row" alignItems="center">
            {splits.map((split) => (
              <SplitToolbar split={split} key={split.id} />
            ))}
          </Flex>
          <Flex
            className="tracks"
            style={{ height: `calc(100% - ${REF_SEQ_HEIGHT} - ${SPLIT_TOOLBAR_HEIGHT})` }}
            width="full"
            flexDirection="column"
          >
            {tracks.map((track, trackIndex: number) => {
              return (
                <ErrorBoundary key={trackIndex}>
                  <Track
                    trackData={track}
                    height={`${track.heightPct}%`}
                    width="full"
                    splitGridRef={ref}
                    splits={splits}
                  ></Track>
                  {trackIndex != tracks.length - 1 && (
                    <GridDivider
                      height={`${DIVIDER_PX}px`}
                      width="full"
                      index={trackIndex}
                      orientation="horizontal"
                      splitGridRef={ref}
                    />
                  )}
                </ErrorBoundary>
              );
            })}
          </Flex>
        </Box>
      )}
    </>
  );
};

export default SplitGrid;
