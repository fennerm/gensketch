import { ReactElement } from "react";

import MainWindow from "./components/MainWindow";
import { AlertContextProvider } from "./contexts/AlertContext";
import { RefSeqContextProvider } from "./contexts/RefSeqContext";
import { SplitGridContextProvider } from "./contexts/SplitGridContext";
import { UserConfigContextProvider } from "./contexts/UserConfigContext";

const App = (): ReactElement => {
  return (
    <AlertContextProvider>
      <UserConfigContextProvider>
        <RefSeqContextProvider>
          <SplitGridContextProvider>
            <MainWindow />
          </SplitGridContextProvider>
        </RefSeqContextProvider>
      </UserConfigContextProvider>
    </AlertContextProvider>
  );
};

export default App;
