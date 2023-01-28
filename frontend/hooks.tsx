import { RefObject, useCallback, useEffect, useRef, useState } from "react";

import { PixiApplication, PixiConstructorParams } from "./lib/pixi-utils";
import { EventCallback, EventListener } from "./lib/types";

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

export const useBackendListener = <T,>(
  listener: EventListener<T>,
  callback: EventCallback<T>
): void => {
  useEffect(() => {
    const unlistenFn = listener(callback);

    return () => {
      unlistenFn.then((f) => f());
    };
  }, []);
};

export const useEventListener = (event: string, handler: () => void): void => {
  useEffect(() => {
    window.addEventListener(event, handler);
    return () => {
      window.removeEventListener(event, handler);
    };
  }, []);
};

export interface PixiAppParams<T extends HTMLElement> extends Partial<PixiConstructorParams> {
  ref: RefObject<T>;
}

type DrawFn = () => void;

export const usePixiApp = <T extends HTMLElement>({
  ref,
  backgroundColor,
}: PixiAppParams<T>): PixiApplication => {
  const [pixiApp, setPixiApp] = useState(
    () =>
      new PixiApplication({
        backgroundColor: backgroundColor ? backgroundColor : 0xffffff,
      })
  );

  useEffect(() => {
    if (ref.current === null) {
      return;
    }
    pixiApp.resize(ref.current.offsetWidth, ref.current.offsetHeight);
    ref.current.appendChild(pixiApp.renderer.view);

    return () => {
      pixiApp.destroy();
    };
  }, []);

  return pixiApp;
};

export const usePixiStage = <T extends HTMLElement>({
  ref,
  draw,
}: {
  readonly ref: RefObject<T>;
  readonly draw: DrawFn;
}): void => {
  useEffect(() => {
    draw();
  });

  const handleResize = (): void => {
    if (ref.current !== null) {
      draw();
    }
  };

  useEventListener("resize", handleResize);
};
