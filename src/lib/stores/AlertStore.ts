/**
 * Svelte store which manages alerts to be displayed to the user.
 */
import { type Subscriber, type Unsubscriber, writable } from "svelte/store";
import { v4 as uuidv4 } from "uuid";

import type { AlertData, AlertStatusUpdateParams } from "@lib/bindings";
import LOG from "@lib/logger";

// Data for a single alert contained in the store.
export interface AlertStatus extends AlertData {
  // Unique id for the alert.
  id: string;

  // If true, the alert is currently being displayed to the user.
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
      alerts = [...alerts, alertStatus];
      return alerts;
    });
  };

  const updateAlertStatus = ({ alertId, newStatus }: AlertStatusUpdateParams): void => {
    LOG.debug(`Setting alert ${alertId} status to ${newStatus}...`);
    update((alerts) => {
      const targetAlert = alerts.find((x) => x.id == alertId);
      if (targetAlert === undefined) {
        LOG.error(`Attempted to update alert ${alertId} which does not exist`);
      } else {
        targetAlert.status = newStatus;
      }
      alerts = [...alerts];
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
      alerts = [...alerts];
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
