import { Component, type ErrorInfo, type ReactNode } from "react";
import { logDiagnostic } from "../../lib/diagnostics";

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

/**
 * A crash anywhere in the tree used to leave an empty window with nothing to
 * go on. It now says what broke, writes it to diagnostics.log with the
 * components it came through, and offers a reload.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = (info.componentStack ?? "")
      .trim()
      .split("\n")
      .slice(0, 5)
      .map((line) => line.trim())
      .join(" < ");
    logDiagnostic("crash", `${error.name}: ${error.message}${where ? ` | ${where}` : ""}`);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-crash" role="alert">
        <strong>MiniFy ran into an error</strong>
        <p>{error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
