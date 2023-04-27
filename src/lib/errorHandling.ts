import { ALERT_STORE } from "@lib/stores/AlertStore";
import LOG from "@lib/logger";
import { isString } from "@lib/util";

const isError = (e: unknown): e is Error => {
  return e instanceof Error;
};

const parseUntypedErrorMsg = (msg: unknown): string => {
  let msgString;
  if (isError(msg)) {
    msgString = msg.message;
  } else if (isString(msg)) {
    msgString = msg;
  } else {
    throw new Error("`msg` must be a string or an Error object");
  }
  return msgString;
};

export const defaultErrorHandler = ({
  msg,
  alertMsg,
  displayAlert = true,
  rethrowError,
}: {
  msg: unknown;
  alertMsg?: string;
  displayAlert?: boolean;
  rethrowError?: unknown;
}) => {
  const msgString = parseUntypedErrorMsg(msg);
  LOG.error(msgString);
  if (alertMsg === undefined) {
    alertMsg = msgString;
  }
  if (displayAlert) {
    ALERT_STORE.addAlert({ message: alertMsg, status: "error" });
  }
  throw new Error(msgString, { cause: rethrowError });
};
