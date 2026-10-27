import React, { Component, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

type ErrorBoundaryState = { error: string | null };

class AppStartupBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error.stack || error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Ma9icTV startup crash]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <StartupDiagnostic title="Ma9icTV failed to start" detail={this.state.error} />;
    }
    return this.props.children;
  }
}

function StartupDiagnostic({ title, detail }: { title: string; detail: string }) {
  return (
    <main style={{ boxSizing: 'border-box', minHeight: '100vh', padding: 28, background: '#070d18', color: '#e6f0fc', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#36e4f7', fontSize: 28, marginBottom: 12 }}>{title}</h1>
      <p style={{ fontSize: 16, marginBottom: 16 }}>Startup diagnostics (send this message back so the failure can be fixed):</p>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#ffd5a5', fontSize: 13 }}>{detail}</pre>
    </main>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<main style="background:#070d18;color:#36e4f7;padding:24px;font:16px system-ui">Ma9icTV startup error: missing #root element.</main>';
} else {
  const root = createRoot(rootElement);
  // Catch errors that happen before React can render its own diagnostic screen.
  window.addEventListener('error', (event) => {
    console.error('[Ma9icTV window error]', event.error || event.message);
    if (!rootElement.hasChildNodes()) {
      root.render(<StartupDiagnostic title="Ma9icTV JavaScript error" detail={String(event.error?.stack || event.message || 'Unknown browser error')} />);
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Ma9icTV unhandled rejection]', event.reason);
  });
  root.render(
    <AppStartupBoundary>
      <App />
    </AppStartupBoundary>
  );
}
