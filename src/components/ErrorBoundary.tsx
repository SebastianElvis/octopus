import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback. Receives the caught error. */
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) {
        return fallback(error);
      }

      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-800/60 dark:bg-red-950/20">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">
            Something went wrong while rendering this component.
          </p>
          <p className="max-w-sm break-all font-mono text-xs text-red-500/70 dark:text-red-300/70">
            {error.message}
          </p>
          <button
            onClick={this.handleReset}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:border-red-400 hover:text-red-700 dark:border-red-700 dark:text-red-300 dark:hover:border-red-500 dark:hover:text-red-100"
          >
            Try again
          </button>
        </div>
      );
    }

    return children;
  }
}
