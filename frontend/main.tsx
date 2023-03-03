import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import { monkeyPatchBigInt } from "./lib/util";

monkeyPatchBigInt();

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw "Root div is null";
}

createRoot(rootElement).render(<App />);
