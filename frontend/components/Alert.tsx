import { CloseIcon } from "@chakra-ui/icons";
import { IconButton } from "@chakra-ui/react";
import { Flex } from "@chakra-ui/react";
import { ReactElement, useContext } from "react";

import { AlertContext, AlertData } from "../contexts/AlertContext";

/**
 * An alert to be displayed to the user in the AlertArea
 * @param props
 * @param props.display If true the alert should be rendered
 */
const Alert = ({
  alertData,
  display,
}: {
  alertData: AlertData;
  display: boolean;
}): ReactElement => {
  const context = useContext(AlertContext);

  return (
    <Flex className="alert" width="full" flexDirection="row">
      {display && (
        <Flex>
          {alertData.message}
          <IconButton
            aria-label="Close Alert"
            icon={<CloseIcon />}
            onClick={() => context.deactivateAlert(alertData.id)}
          />
        </Flex>
      )}
    </Flex>
  );
};

export default Alert;
