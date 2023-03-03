import { ReactElement, ReactNode, createContext, useContext, useEffect, useState } from "react";

import { UserConfig } from "../bindings";
import { getUserConfig, listenForUserConfigUpdated } from "../lib/backend";
import { useBackendListener } from "../lib/hooks";
import LOG from "../lib/logger";
import { AlertApiContext } from "./AlertContext";

export const UserConfigContext = createContext<UserConfig | null>(null);

export const UserConfigContextProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);
  const alertApi = useContext(AlertApiContext);

  useEffect(() => {
    getUserConfig()
      .then((newUserConfig) => {
        setUserConfig(newUserConfig);
      })
      .catch((error) => {
        alertApi.addAlert({ message: error, status: "error" });
        LOG.error(error);
      });
  }, []);

  useBackendListener(listenForUserConfigUpdated, (event) => setUserConfig(event.payload));

  return <UserConfigContext.Provider value={userConfig}>{children}</UserConfigContext.Provider>;
};
