import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          color: '#ef5350',
          background: '#131722',
          padding: '24px',
          fontFamily: 'monospace',
          fontSize: '13px',
          wordBreak: 'break-all',
          width: '100vw',
          height: '100vh',
          overflow: 'auto',
        }}>
          <h2 style={{ color: '#f23645', marginTop: 0 }}>⚠ App Crashed</h2>
          <p style={{ color: '#d1d4dc' }}>{this.state.error && this.state.error.toString()}</p>
          {this.state.errorInfo && (
            <pre style={{ color: '#787b86', fontSize: '11px', whiteSpace: 'pre-wrap' }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
