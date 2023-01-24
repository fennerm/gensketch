import { useEventListener } from "@chakra-ui/react";
import { Application } from "pixi.js";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";

export const useElementSize = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  const handleSize = useCallback(() => {
    setSize({
      width: ref.current?.offsetWidth ?? 0,
      height: ref.current?.offsetWidth ?? 0,
    });
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleSize);
    return () => {
      window.removeEventListener("resize", handleSize);
    };
  });

  useEffect(() => {
    if (size.width !== ref.current?.offsetWidth || size.height !== ref.current?.offsetHeight)
      handleSize();
  }, []);

  return ref;
};

export const usePixiApp = <T extends HTMLElement>(ref: RefObject<T>): Application | null => {
  const [pixiApp, setPixiApp] = useState<Application | null>(null);
  useEffect(() => {
    if (ref.current === null) {
      return;
    }
    const app = new Application({
      resizeTo: ref.current,
      backgroundColor: Math.floor(Math.random() * 16777215),
    });
    ref.current.appendChild(app.view);
    app.start();
    setPixiApp(app);

    return () => {
      if (pixiApp !== null) {
        pixiApp.destroy(true, true);
      }
    };
  }, []);

  return pixiApp;
};
