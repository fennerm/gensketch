import { Box } from "@chakra-ui/react";
import { ReactElement, ReactNode, useState } from "react";

const GridCell = ({
  children,
  width,
  height,
  trackIndex,
  splitIndex,
}: {
  children?: ReactNode;
  width: string;
  height: string;
  trackIndex: number;
  splitIndex: number;
}): ReactElement => {
  const [color, setColor] = useState(`#${Math.floor(Math.random() * 16777215).toString(16)}`);
  return (
    <Box className="grid-cell" width={width} height={height} backgroundColor={color}>
      {children}
    </Box>
  );
};

export default GridCell;
