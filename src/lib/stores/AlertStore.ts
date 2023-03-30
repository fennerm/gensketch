import type { AlertData, AlertStatusUpdateParams } from "@lib/bindings";
import LOG from "@lib/logger";
import { writable } from "svelte/store";
import type { Subscriber, Unsubscriber } from "svelte/store";
import { v4 as uuidv4 } from "uuid";

export interface AlertStatus extends AlertData {
  id: string;
  active: boolean;
}

interface AlertStoreInterface {
  subscribe: (this: void, run: Subscriber<AlertStatus[]>) => Unsubscriber;
  addAlert: (alert: AlertData) => void;
  updateAlertStatus: ({ alertId, newStatus }: AlertStatusUpdateParams) => void;
  deactivateAlert: (alertId: string) => void;
}

const createAlertStore = (): AlertStoreInterface => {
  const { subscribe, update } = writable<AlertStatus[]>([]);

  const addAlert = (alert: AlertData): void => {
    LOG.info(`New alert: ${JSON.stringify(alert)}`);
    const alertStatus: AlertStatus = { ...alert, id: uuidv4(), active: true };
    update((alerts) => {
      alerts.push(alertStatus);
      return alerts;
    });
  };

  const updateAlertStatus = ({ alertId, newStatus }: AlertStatusUpdateParams): void => {
    LOG.info(`Setting alert ${alertId} status to ${newStatus}...`);
    update((alerts) => {
      const targetAlert = alerts.find((x) => x.id == alertId);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertId} which does not exist`);
      } else {
        targetAlert.status = newStatus;
      }
      return alerts;
    });
  };

  const deactivateAlert = (alertId: string): void => {
    LOG.info(`Closing alert ${alertId}...`);
    update((alerts) => {
      const targetAlert = alerts.find((x) => x.id == alertId);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertId} which does not exist`);
      } else {
        targetAlert.active = false;
      }
      return alerts;
    });
  };

  return {
    subscribe,
    addAlert,
    updateAlertStatus,
    deactivateAlert,
  };
};

export const ALERT_STORE = createAlertStore();
