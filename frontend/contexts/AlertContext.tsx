import { ReactElement, ReactNode, createContext, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { AlertData, AlertStatusUpdateParams, AlertStatusValue } from "../bindings";
import { listenForAlertStatusUpdated, listenForNewAlert } from "../lib/backend";
import { useBackendListener } from "../lib/hooks";
import LOG from "../lib/logger";

export interface AlertStatus extends AlertData {
  id: string;
  active: boolean;
}

interface AlertContextInterface {
  readonly alerts: AlertStatus[];
}

interface AlertApiContextInterface {
  readonly addAlert: (alert: AlertData) => void;
  readonly deactivateAlert: (alertId: string) => void;
  readonly updateAlertStatus: ({ alertId, newStatus }: AlertStatusUpdateParams) => void;
}

export const AlertContext = createContext<AlertContextInterface>({} as AlertContextInterface);
export const AlertApiContext = createContext<AlertApiContextInterface>(
  {} as AlertApiContextInterface
);

export const AlertContextProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
  const [alerts, setAlerts] = useState<AlertStatus[]>([]);

  const addAlert = (alert: AlertData): void => {
    LOG.info(`New alert: ${JSON.stringify(alert)}`);
    setAlerts((alerts) => {
      const alertStatus: AlertStatus = { ...alert, id: uuidv4(), active: true };
      alerts.push(alertStatus);
      return [...alerts];
    });
  };

  const updateAlertStatus = ({ alertId, newStatus }: AlertStatusUpdateParams): void => {
    setAlerts((alerts) => {
      LOG.info(`Setting alert ${alertId} status to ${newStatus}...`);
      let targetAlert = alerts.find((x) => x.id == alertId);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertId} which does not exist`);
        return alerts;
      }
      targetAlert.status = newStatus;
      return [...alerts];
    });
  };

  const deactivateAlert = (alertId: string): void => {
    setAlerts((alerts) => {
      LOG.info(`Closing alert ${alertId}...`);
      let targetAlert = alerts.find((x) => x.id == alertId);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertId} which does not exist`);
        return alerts;
      }
      LOG.info(`${JSON.stringify(targetAlert)}`);
      targetAlert.active = false;
      return [...alerts];
    });
  };

  useBackendListener(listenForNewAlert, (event) => addAlert(event.payload));
  useBackendListener(listenForAlertStatusUpdated, (event) => updateAlertStatus(event.payload));

  const value = {
    alerts,
    addAlert,
  };
  const apiValue = {
    addAlert,
    updateAlertStatus,
    deactivateAlert,
  };
  return (
    <AlertContext.Provider value={value}>
      <AlertApiContext.Provider value={apiValue}>{children}</AlertApiContext.Provider>
    </AlertContext.Provider>
  );
};
