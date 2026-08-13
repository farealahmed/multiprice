'use client';

import { useEffect, useState } from 'react';

import { Topbar } from '@/components/shell/Topbar';
import { ApiError, apiFetch } from '@/lib/api/client';
import type { HealthResponse } from '@/lib/api/types/health';

type HealthView =
  | { kind: 'loading' }
  | { kind: 'ready'; response: HealthResponse }
  | { kind: 'failed'; message: string };

export default function HomePage() {
  const [health, setHealth] = useState<HealthView>({ kind: 'loading' });

  async function loadHealth() {
    setHealth({ kind: 'loading' });

    try {
      const response = await apiFetch<HealthResponse>('/api/health');
      setHealth({ kind: 'ready', response });
    } catch (error) {
      setHealth({
        kind: 'failed',
        message: error instanceof ApiError ? error.message : 'The health service is unavailable.',
      });
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  const isReady = health.kind === 'ready';
  const isFailed = health.kind === 'failed';
  const backendState = isReady
    ? health.response.status === 'ok'
      ? 'healthy'
      : 'degraded'
    : isFailed
      ? 'unavailable'
      : 'checking';
  const databaseState = isReady
    ? health.response.db
    : isFailed
      ? 'unavailable'
      : 'checking';

  return (
    <>
      <Topbar />
      <main className="page">
        <p className="kicker">System readiness</p>
        <h1>Connected by design.</h1>
        <p className="lede">
          MultiPrice keeps browser traffic same-origin while the service checks its database
          connection at the source.
        </p>

        <section aria-live="polite" className="health-panel">
          <p className="health-heading">Current health</p>
          <div className="health-states">
            <div className="health-state">
              <span className="health-label">Backend</span>
              <strong
                className="health-value"
                data-state={backendState}
                data-testid="health-backend-status"
              >
                {backendState}
              </strong>
            </div>
            <div className="health-state">
              <span className="health-label">Database</span>
              <strong
                className="health-value"
                data-state={databaseState}
                data-testid="health-db-status"
              >
                {databaseState}
              </strong>
            </div>
          </div>

          {isReady ? (
            <p className="health-version" data-testid="health-version">
              Version {health.response.version}
            </p>
          ) : null}

          {isFailed ? (
            <>
              <p className="health-error">{health.message}</p>
              <button className="health-retry" data-testid="health-retry" onClick={() => void loadHealth()}>
                Try again
              </button>
            </>
          ) : null}
        </section>
      </main>
    </>
  );
}
