import { CloseIcon } from "@chakra-ui/icons";
import { IconButton } from "@chakra-ui/react";
import { Flex } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { AlertApiContext, AlertContext, AlertStatus } from "../contexts/AlertContext";

/**
 * An alert to be displayed to the user in the AlertArea
 * @param props
 * @param props.display If true the alert should be rendered
 */
const Alert = ({
  alertData,
  display,
}: {
  readonly alertData: AlertStatus;
  readonly display: boolean;
}): ReactElement => {
  const context = useContext(AlertContext);
  const api = useContext(AlertApiContext);

  return (
    <Flex className="alert" width="full" flexDirection="row">
      {display && (
        <Flex>
          {alertData.message}
          <IconButton
            aria-label="Close Alert"
            icon={<CloseIcon />}
            onClick={() => api.deactivateAlert(alertData.id)}
          />
        </Flex>
      )}
    </Flex>
  );
};

export default Alert;
