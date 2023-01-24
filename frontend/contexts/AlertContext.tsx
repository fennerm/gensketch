import { ReactElement, ReactNode, createContext, useEffect, useState } from "react";

import { AlertData, AlertStatusUpdateParams, AlertStatusValue } from "../bindings";
import { listen, listenForAlertStatusUpdated, listenForNewAlert } from "../lib/backend";
import LOG from "../lib/logger";

export interface AlertStatus extends AlertData {
  active: boolean;
}

interface AlertContextInterface {
  alerts: AlertStatus[];
  addAlert: (alert: AlertData) => void;
  updateAlertStatus: ({ alertID, newStatus }: AlertStatusUpdateParams) => void;
  deactivateAlert: (alertID: string) => void;
}

export const AlertContext = createContext<AlertContextInterface>({} as AlertContextInterface);

export const AlertContextProvider = ({ children }: { children?: ReactNode }): ReactElement => {
  const [alerts, setAlerts] = useState<AlertStatus[]>([]);

  const addAlert = (alert: AlertData): void => {
    LOG.info(`New alert: ${JSON.stringify(alert)}`);
    setAlerts((alerts) => {
      const alertStatus: AlertStatus = { ...alert, active: true };
      alerts.push(alertStatus);
      return [...alerts];
    });
  };

  const updateAlertStatus = ({ alertID, newStatus }: AlertStatusUpdateParams): void => {
    setAlerts((alerts) => {
      LOG.info(`Setting alert ${alertID} status to ${newStatus}...`);
      let targetAlert = alerts.find((x) => x.id == alertID);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertID} which does not exist`);
        return alerts;
      }
      targetAlert.status = newStatus;
      return [...alerts];
    });
  };

  const deactivateAlert = (alertID: string): void => {
    setAlerts((alerts) => {
      LOG.info(`Closing alert ${alertID}...`);
      let targetAlert = alerts.find((x) => x.id == alertID);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertID} which does not exist`);
        return alerts;
      }
      LOG.info(`${JSON.stringify(targetAlert)}`);
      targetAlert.active = false;
      return [...alerts];
    });
  };

  useEffect(() => {
    const unlistenCallbacks = [
      listenForNewAlert((event) => addAlert(event.payload)),
      listenForAlertStatusUpdated((event) => updateAlertStatus(event.payload)),
    ];

    return () => {
      unlistenCallbacks.map((unlisten) => {
        unlisten.then((f) => f());
      });
    };
  }, []);

  const value = {
    alerts,
    addAlert,
    updateAlertStatus,
    deactivateAlert,
  };
  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
};
