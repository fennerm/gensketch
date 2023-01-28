import { ReactElement, ReactNode, createContext, useState } from "react";

import { AlertData, AlertStatusUpdateParams, AlertStatusValue } from "../bindings";
import { useBackendListener } from "../hooks";
import { listenForAlertStatusUpdated, listenForNewAlert } from "../lib/backend";
import LOG from "../lib/logger";

export interface AlertStatus extends AlertData {
  active: boolean;
}

interface AlertContextInterface {
  readonly alerts: AlertStatus[];
  readonly addAlert: (alert: AlertData) => void;
  readonly updateAlertStatus: ({ alertID, newStatus }: AlertStatusUpdateParams) => void;
  readonly deactivateAlert: (alertID: string) => void;
}

export const AlertContext = createContext<AlertContextInterface>({} as AlertContextInterface);

export const AlertContextProvider = ({
  children,
}: {
  readonly children?: ReactNode;
}): ReactElement => {
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

  useBackendListener(listenForNewAlert, (event) => addAlert(event.payload));
  useBackendListener(listenForAlertStatusUpdated, (event) => updateAlertStatus(event.payload));

  const value = {
    alerts,
    addAlert,
    updateAlertStatus,
    deactivateAlert,
  };
  return <AlertContext.Provider value={value}>{children}</AlertContext.Provider>;
};
