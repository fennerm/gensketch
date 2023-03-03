import { Flex } from "@chakra-ui/react";
import { ReactElement, useState } from "react";

import { useEventListener } from "../lib/hooks";
import LOG from "../lib/logger";
import AlertArea from "./AlertArea";
import ErrorBoundary from "./ErrorBoundary";
import SplitGrid from "./SplitGrid";
import Toolbar from "./Toolbar";

const MainWindow = (): ReactElement => {
  const [windowDimensions, setWindowDimensions] = useState({
    height: window.innerHeight,
    width: window.innerWidth,
  });

  const handleWindowResize = (): void => {
    LOG.debug(`Window resized to ${window.innerHeight}x${window.innerWidth}`);
    setWindowDimensions({
      height: window.innerHeight,
      width: window.innerWidth,
    });
  };

  useEventListener("resize", handleWindowResize);

  return (
    <Flex
      flexDirection="column"
      className="app"
      height={`${windowDimensions.height}px`}
      width={`${windowDimensions.width}px`}
      bg="brand.bg"
    >
      <ErrorBoundary>
        <Toolbar height="150px" width="full" />
      </ErrorBoundary>
      <ErrorBoundary>
        <AlertArea />
      </ErrorBoundary>
      <ErrorBoundary>
        <SplitGrid height={windowDimensions.height - 150} width="full" />
      </ErrorBoundary>
    </Flex>
  );
};

export default MainWindow;
