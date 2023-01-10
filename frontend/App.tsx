import { Flex } from "@chakra-ui/react";
import { ReactElement, useEffect, useState } from "react";

import "./App.css";
import ErrorBoundary from "./components/ErrorBoundary";
import SplitGrid from "./components/SplitGrid";
import Toolbar from "./components/Toolbar";
import { RefSeqContextProvider } from "./contexts/RefSeqContext";
import { SplitGridContextProvider } from "./contexts/SplitGridContext";
import LOG from "./lib/logger";

const App = (): ReactElement => {
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
  });

  return (
    <RefSeqContextProvider>
      <SplitGridContextProvider>
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
            <SplitGrid height="full" width="full" />
          </ErrorBoundary>
        </Flex>
      </SplitGridContextProvider>
    </RefSeqContextProvider>
  );
};

export default App;
