import { ChakraProvider } from "@chakra-ui/react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import { monkeyPatchBigInt } from "./lib/util";

monkeyPatchBigInt();

createRoot(document.getElementById("root") as HTMLElement).render(
  <ChakraProvider>
    <App />
  </ChakraProvider>
);
