import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api';
import { SIGN_IN_URL, useAuth } from '../auth';
import { ClaimStatusPill, EmptyState, ErrorState, GoogleMark, ItemStatusPill, Spinner, useToast } from '../components';
import { CATEGORY_LABELS, timeAgo } from '../labels';
import type { Claim, Item } from '../types';

type Tab = 'listings' | 'claims';

export function ActivityPage() {
  const { me, loading } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('listings');
  const [items, setItems] = useState<Item[] | null>(null);
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const signedIn = Boolean(me?.user);

  const load = useCallback(async () => {
    if (!signedIn) return;
    setError(null);
    try {
      const [mine, myClaims] = await Promise.all([api.myItems(), api.myClaims()]);
      setItems(mine.items);
      setClaims(myClaims.claims);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your activity.');
    }
  }, [signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="wrap page-narrow"><Spinner /></div>;
  if (!signedIn) {
    return (
      <div className="wrap page-narrow">
        <h1 className="page-title">My activity</h1>
        <p className="lede">Sign in to see the items you posted and the claims you sent.</p>
        {me?.authConfigured && <a className="btn btn--google" href={SIGN_IN_URL}><GoogleMark /> Sign in with Google</a>}
      </div>
    );
  }

  const withdraw = async (claim: Claim) => {
    try {
      await api.claimAction(claim.id, 'cancel');
      toast('Claim withdrawn.');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not withdraw the claim.', 'error');
    }
  };

  const pendingTotal = items?.reduce((sum, i) => sum + (i.status !== 'resolved' ? i.pendingClaims ?? 0 : 0), 0) ?? 0;

  return (
    <div className="wrap page-activity">
      <h1 className="page-title">My activity</h1>
      <div className="tabs" role="tablist" aria-label="My activity">
        <button type="button" role="tab" id="tab-listings" aria-controls="panel-listings" aria-selected={tab === 'listings'} className={tab === 'listings' ? 'is-on' : ''} onClick={() => setTab('listings')}>
          My listings {items && <span className="count">{items.length}</span>}
          {pendingTotal > 0 && <span className="count count--alert" title="Claims waiting for your reply">{pendingTotal} new</span>}
        </button>
        <button type="button" role="tab" id="tab-claims" aria-controls="panel-claims" aria-selected={tab === 'claims'} className={tab === 'claims' ? 'is-on' : ''} onClick={() => setTab('claims')}>
          My claims {claims && <span className="count">{claims.length}</span>}
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : tab === 'listings' ? (
        <section role="tabpanel" id="panel-listings" aria-labelledby="tab-listings">
          {!items ? <Spinner /> : items.length === 0 ? (
            <EmptyState title="You have not posted anything yet" action={<Link className="btn btn--primary" to="/report">Report an item</Link>}>
              Lost something, or picked something up? Post it so the right person can find it.
            </EmptyState>
          ) : (
            <ul className="row-list">
              {items.map((item) => (
                <li key={item.id}>
                  <Link to={`/items/${item.id}`} className="row-card">
                    <span className={`mini-stamp mini-stamp--${item.itemType}`}>{item.itemType === 'lost' ? 'Lost' : 'Found'}</span>
                    <span className="row-card__main">
                      <strong>{item.title}</strong>
                      <span>{CATEGORY_LABELS[item.category]} at {item.location}, posted {timeAgo(item.createdAt)}</span>
                    </span>
                    <span className="row-card__side">
                      {(item.pendingClaims ?? 0) > 0 && item.status !== 'resolved' && (
                        <span className="count count--alert">{item.pendingClaims} waiting</span>
                      )}
                      <ItemStatusPill status={item.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section role="tabpanel" id="panel-claims" aria-labelledby="tab-claims">
          {!claims ? <Spinner /> : claims.length === 0 ? (
            <EmptyState title="You have not claimed anything" action={<Link className="btn btn--primary" to="/">Browse items</Link>}>
              When you spot something that is yours, open it and send a claim.
            </EmptyState>
          ) : (
            <ul className="row-list">
              {claims.map((claim) => (
                <li key={claim.id} className="row-card row-card--static">
                  <span className={`mini-stamp mini-stamp--${claim.item?.itemType}`}>{claim.item?.itemType === 'lost' ? 'Lost' : 'Found'}</span>
                  <span className="row-card__main">
                    <Link to={`/items/${claim.itemId}`}><strong>{claim.item?.title}</strong></Link>
                    <span>“{claim.message}”</span>
                    <span className="hint">Sent {timeAgo(claim.createdAt)}</span>
                  </span>
                  <span className="row-card__side">
                    <ClaimStatusPill status={claim.status} />
                    {(claim.status === 'pending' || claim.status === 'accepted') && claim.item?.status !== 'resolved' && (
                      <button type="button" className="btn btn--quiet btn--small" onClick={() => void withdraw(claim)}>Withdraw</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
