// shared/SurfaceBoundary.tsx — error boundary for surface panels. Extracted from
// the retired meridian/MeridianSurfacePage so v2 and the /kyc Layout can share it.
import React from 'react';
import { Link } from 'react-router-dom';
import { EaseError } from './ease/states';

// Every leaf inherits graceful failure: a surface that throws renders the shared
// EaseError card (with retry + an Atlas escape) instead of blanking the app.
export class SurfaceBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return (
        <EaseError message="This surface hit an error and couldn't render." onRetry={() => this.setState({ failed: false })}>
          <Link to="/cockpit" className="btn ghost">Back to your cockpit</Link>
        </EaseError>
      );
    }
    return this.props.children;
  }
}
