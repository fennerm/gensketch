import { ChakraProvider } from "@chakra-ui/react";
import { render } from "react-dom";

import App from "./App";
import "./index.css";
import { monkeyPatchBigInt } from "./lib/util";

monkeyPatchBigInt();

// Update to this once pixi js supports react v18:
// ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
const container = document.getElementById("root");

render(
  <ChakraProvider>
    <App />
  </ChakraProvider>,
  container
);
