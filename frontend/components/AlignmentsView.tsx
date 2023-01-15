import { Box } from "@chakra-ui/react";
import { ReactElement, useContext, useEffect, useState } from "react";

import { AlignmentStackData } from "../bindings";
import { RefSeqContext } from "../contexts/RefSeqContext";
import { getAlignments } from "../lib/backends/tauri";

const AlignmentsView = ({ width, height }: { width: string; height: string }): ReactElement => {
  const refSeqContext = useContext(RefSeqContext);
  const [alignments, setAlignments] = useState<AlignmentStackData | null>(null);

  useEffect(() => {
    getAlignments(refSeqContext.focusedRegion).then((result) => setAlignments(result));
  }, [refSeqContext.focusedRegion]);

  return <Box className="alignments-view" width={width} height={height} />;
};

export default AlignmentsView;
