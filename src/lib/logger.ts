import Pino from "pino";

const LEVEL = process.env.NODE_ENV === "production" ? "warning" : "debug";

const LOG = Pino({ name: "gensketch", level: LEVEL });
export default LOG;
