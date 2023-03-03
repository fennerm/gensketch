import { ChakraProvider } from "@chakra-ui/react";
import { ReactElement, useCallback, useContext } from "react";

import MainWindow from "./components/MainWindow";
import { AlertContextProvider } from "./contexts/AlertContext";
import { RefSeqContextProvider } from "./contexts/RefSeqContext";
import { SplitGridContextProvider } from "./contexts/SplitGridContext";
import { UserConfigContext, UserConfigContextProvider } from "./contexts/UserConfigContext";
import { buildTheme } from "./lib/theme";

const App = (): ReactElement => {
  return (
    <UserConfigContextProvider>
      <InnerApp />
    </UserConfigContextProvider>
  );
};

// Separating the App into two components so that the UserConfigContext can be used within the
// ChakraProvider.
const InnerApp = (): ReactElement => {
  const userConfigContext = useContext(UserConfigContext);

  return (
    <>
      {userConfigContext !== null && (
        <ChakraProvider theme={buildTheme(userConfigContext)}>
          <AlertContextProvider>
            <RefSeqContextProvider>
              <SplitGridContextProvider>
                <MainWindow />
              </SplitGridContextProvider>
            </RefSeqContextProvider>
          </AlertContextProvider>
        </ChakraProvider>
      )}
    </>
  );
};

export default App;
