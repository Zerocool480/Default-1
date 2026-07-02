import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePlaidLink } from 'react-plaid-link';
import { Landmark } from 'lucide-react';
import { api } from '../lib/api';

/**
 * "Connect a bank" via Plaid Link. The flow: server mints a link_token, the
 * Plaid widget runs entirely client-side, and the resulting public_token is
 * exchanged server-side — the access token never exists in the browser.
 */
export function ConnectBank() {
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'exchanging'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: { institution?: { institution_id?: string; name?: string } | null }) => {
      setPhase('exchanging');
      setError(null);
      try {
        await api('/api/plaid/exchange', {
          method: 'POST',
          json: {
            publicToken,
            institutionId: metadata.institution?.institution_id,
            institutionName: metadata.institution?.name,
          },
        });
        await qc.invalidateQueries();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not finish connecting');
      } finally {
        setPhase('idle');
        setLinkToken(null);
      }
    },
    [qc],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      setPhase('idle');
      setLinkToken(null);
    },
  });

  async function start() {
    setPhase('starting');
    setError(null);
    try {
      const { linkToken } = await api<{ linkToken: string }>('/api/plaid/link-token', {
        method: 'POST',
      });
      setLinkToken(linkToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bank connections unavailable');
      setPhase('idle');
    }
  }

  // Open the widget as soon as the token is ready.
  if (linkToken && ready && phase === 'starting') {
    setPhase('exchanging');
    open();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button className="btn-primary self-start" onClick={start} disabled={phase !== 'idle'}>
        <Landmark size={15} />
        {phase === 'idle' ? 'Connect a bank' : phase === 'starting' ? 'Opening…' : 'Finishing…'}
      </button>
      {error && <p className="text-xs text-state-hold">{error}</p>}
    </div>
  );
}
