import { ReactElement } from "react";

import "./App.css";
import MainWindow from "./MainWindow";
import { AlertContextProvider } from "./contexts/AlertContext";
import { RefSeqContextProvider } from "./contexts/RefSeqContext";
import { SplitGridContextProvider } from "./contexts/SplitGridContext";

const App = (): ReactElement => {
  return (
    <AlertContextProvider>
      <RefSeqContextProvider>
        <SplitGridContextProvider>
          <MainWindow />
        </SplitGridContextProvider>
      </RefSeqContextProvider>
    </AlertContextProvider>
  );
};

export default App;
