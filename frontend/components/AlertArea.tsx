import { Flex } from "@chakra-ui/react";
import { ReactElement, useContext, useState } from "react";

import { AlertContext } from "../contexts/AlertContext";
import Alert from "./Alert";

// active-only = Only display errors/warnings which have not been dismissed by the user
// history = Also display historical alerts which have already expired or been dismissed
type AlertAreaDisplayState = "active-only" | "history";

/**
 * Section of the UI where alerts are displayed to the user.
 */
const AlertArea = (): ReactElement => {
  const [displayState, setDisplayState] = useState<AlertAreaDisplayState>("active-only");
  const alertContext = useContext(AlertContext);

  return (
    <Flex className="alert-area" width="full" flexDirection="column">
      {alertContext.alerts.map((alert) => {
        return (
          <Alert
            key={alert.id}
            alertData={alert}
            display={displayState === "history" || (displayState === "active-only" && alert.active)}
          />
        );
      })}
    </Flex>
  );
};

export default AlertArea;
