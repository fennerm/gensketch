import { ALERT_STORE } from "@lib/stores/AlertStore";
import LOG from "@lib/logger";

export const defaultErrorHandler = (message: string, alert?: string) => {
  LOG.error(message);
  if (alert === undefined) {
    alert = message;
  }
  ALERT_STORE.addAlert({ message: alert, status: "error" });
};
