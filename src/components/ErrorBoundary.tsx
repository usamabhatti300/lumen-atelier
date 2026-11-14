import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

/** Catches render errors below it, so a broken screen shows a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[app] A screen crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-5 bg-ground px-6 text-center">
        <p className="max-w-sm text-base text-fg">Something went wrong. Your photos and edits are saved on this device.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
        {/* A full page load on purpose: it also clears the broken screen's state. */}
        <a href={import.meta.env.BASE_URL} className="text-sm text-fg-3 underline underline-offset-4 hover:text-fg">
          Back to home
        </a>
      </div>
    );
  }
}
