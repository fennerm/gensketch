import { Flex } from "@chakra-ui/react";
import { ReactElement, useEffect, useState } from "react";

import "./App.css";
import AlertArea from "./components/AlertArea";
import ErrorBoundary from "./components/ErrorBoundary";
import SplitGrid from "./components/SplitGrid";
import Toolbar from "./components/Toolbar";
import LOG from "./lib/logger";

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

  useEffect(() => {
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  return (
    <Flex
      flexDirection="column"
      className="app"
      height={`${windowDimensions.height}px`}
      width={`${windowDimensions.width}px`}
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
