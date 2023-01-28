import { Component, ErrorInfo, ReactNode } from "react";

import LOG from "../lib/logger";

interface Props {
  readonly children?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    LOG.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ backgroundColor: "#FFCCCB" }}>
          <h1>Error! Sorry this is a bug</h1>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
