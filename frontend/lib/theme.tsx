import { extendTheme } from "@chakra-ui/react";

import { UserConfig } from "../bindings";
import LOG from "./logger";
import { hexToString } from "./util";

export type ChakraTheme = Record<string, any>;

export const buildTheme = (userConfig: UserConfig): ChakraTheme => {
  LOG.debug(`Loading theme: ${JSON.stringify(userConfig.styles.colors)}`);

  const theme = extendTheme({
    colors: {
      body: {
        color: hexToString(userConfig.styles.colors.text),
      },
      brand: {
        bg: hexToString(userConfig.styles.colors.background),
        text: hexToString(userConfig.styles.colors.text),
        secondaryText: hexToString(userConfig.styles.colors.secondaryText),
        trackLabelBackground: hexToString(userConfig.styles.colors.trackLabelBackground),
      },
    },
    components: {
      Text: {
        baseStyle: {
          color: hexToString(userConfig.styles.colors.text),
        },
      },
      Input: {
        variants: {
          baseInput: {
            field: {
              border: `1px solid ${hexToString(userConfig.styles.colors.text)}`,
            },
          },
        },
        defaultProps: {
          variant: "baseInput",
        },
      },
    },
  });
  return theme;
};
