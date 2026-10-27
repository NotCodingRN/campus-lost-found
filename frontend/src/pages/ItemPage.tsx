import { ArrowLeft, Building2, Mail, MessageSquare, PackageCheck } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, api } from '../api';
import { SIGN_IN_URL, useAuth } from '../auth';
import { ClaimStatusPill, ErrorState, GoogleMark, ItemStatusPill, ItemTag, Spinner, useToast } from '../components';
import { CATEGORY_LABELS, CONTACT_LABELS, formatDate, timeAgo } from '../labels';
import type { ItemDetail } from '../types';

export function ItemPage() {
  const { id } = useParams();
  const { me } = useAuth();
  const toast = useToast();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetail(await api.getItem(id ?? ''));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) setNotFound(true);
      else setError(e instanceof Error ? e.message : 'Could not load this item.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load, me?.user?.email]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast(success);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="wrap page-narrow">
        <h1 className="page-title">This listing does not exist</h1>
        <p className="lede">It may have been removed, or the link is wrong.</p>
        <Link className="btn btn--primary" to="/">Browse all items</Link>
      </div>
    );
  }
  if (error) return <div className="wrap page-narrow"><ErrorState message={error} onRetry={() => void load()} /></div>;
  if (!detail) return <div className="wrap page-narrow"><Spinner label="Loading item" /></div>;

  const { item, isOwner, viewerClaim, contact } = detail;
  const claimVerb = item.itemType === 'found' ? 'This is mine' : 'I found this';
  const activeViewerClaim = viewerClaim && ['pending', 'accepted'].includes(viewerClaim.status) ? viewerClaim : null;

  return (
    <div className="wrap item-page">
      <Link to="/" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> All items</Link>

      <div className="item-layout">
        <div className="item-layout__tag">
          <ItemTag item={item} size="large" linked={false} />
        </div>

        <div className="item-layout__info">
          <div className="item-heading">
            <ItemStatusPill status={item.status} />
            {item.isDemo && <span className="pill pill--demo">Demo listing for the presentation</span>}
          </div>
          <h1 className="page-title">{item.title}</h1>
          <p className="item-description">{item.description}</p>

          <dl className="facts">
            <div><dt>{item.itemType === 'lost' ? 'Last seen' : 'Found at'}</dt><dd>{item.location}</dd></div>
            <div><dt>{item.itemType === 'lost' ? 'Lost on' : 'Found on'}</dt><dd>{formatDate(item.eventDate)}</dd></div>
            <div><dt>Category</dt><dd>{CATEGORY_LABELS[item.category] ?? item.category}</dd></div>
            <div><dt>Posted by</dt><dd>{item.owner.displayName}, {timeAgo(item.createdAt)}</dd></div>
            <div><dt>Contact</dt><dd>{CONTACT_LABELS[item.contactPreference].title}</dd></div>
          </dl>

          {isOwner ? (
            <OwnerPanel detail={detail} busy={busy} run={run} />
          ) : item.status === 'resolved' ? (
            <div className="panel panel--quiet">
              <PackageCheck size={22} aria-hidden="true" />
              <p>This item has been returned to its owner, so it no longer takes claims.</p>
            </div>
          ) : !me?.user ? (
            <div className="panel">
              <h2 className="panel__title">{item.itemType === 'found' ? 'Is this yours?' : 'Did you find this?'}</h2>
              <p>Sign in with your university Google account to send a claim to the person who posted it.</p>
              {me?.authConfigured ? (
                <a className="btn btn--google" href={SIGN_IN_URL}><GoogleMark /> Sign in with Google</a>
              ) : (
                <p className="hint">Sign-in is not configured on this server yet.</p>
              )}
            </div>
          ) : activeViewerClaim ? (
            <div className="panel">
              <div className="panel__row">
                <h2 className="panel__title">Your claim</h2>
                <ClaimStatusPill status={activeViewerClaim.status} />
              </div>
              <blockquote className="claim-message">{activeViewerClaim.message}</blockquote>
              {activeViewerClaim.status === 'accepted' && contact && (
                <div className="contact-box">
                  {contact.preference === 'email_on_accept' && contact.ownerEmail ? (
                    <p><Mail size={18} aria-hidden="true" /> Arrange the hand-over at <a href={`mailto:${contact.ownerEmail}`}>{contact.ownerEmail}</a>.</p>
                  ) : contact.preference === 'security_desk' ? (
                    <p><Building2 size={18} aria-hidden="true" /> Collect it from the campus security desk. Bring your student ID.</p>
                  ) : (
                    <p><MessageSquare size={18} aria-hidden="true" /> Your claim was accepted. The poster will meet you to hand it over.</p>
                  )}
                </div>
              )}
              <button
                type="button"
                className="btn btn--quiet"
                disabled={busy}
                onClick={() => run(() => api.claimAction(activeViewerClaim.id, 'cancel'), 'Claim withdrawn.')}
              >
                Withdraw my claim
              </button>
            </div>
          ) : (
            <ClaimForm
              verb={claimVerb}
              itemType={item.itemType}
              previous={viewerClaim?.status}
              onSubmit={async (message) => {
                await api.createClaim(item.id, message);
                toast('Claim sent. You will see the reply under My activity.');
                await load();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function OwnerPanel({ detail, busy, run }: {
  detail: ItemDetail;
  busy: boolean;
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const { item, claims } = detail;
  const [confirming, setConfirming] = useState(false);
  const list = claims ?? [];

  return (
    <div className="panel">
      <div className="panel__row">
        <h2 className="panel__title">Claims on your listing</h2>
        <span className="hint">{list.length} total</span>
      </div>

      {list.length === 0 ? (
        <p className="hint">No claims yet. You will see them here when someone responds.</p>
      ) : (
        <ul className="claim-list">
          {list.map((claim) => (
            <li key={claim.id} className="claim-card">
              <div className="panel__row">
                <strong>{claim.claimant?.name}</strong>
                <ClaimStatusPill status={claim.status} />
              </div>
              <blockquote className="claim-message">{claim.message}</blockquote>
              <p className="hint">Sent {timeAgo(claim.createdAt)}</p>
              {claim.claimantEmail && (
                <p className="contact-line"><Mail size={16} aria-hidden="true" /> <a href={`mailto:${claim.claimantEmail}`}>{claim.claimantEmail}</a></p>
              )}
              {item.status !== 'resolved' && (
                <div className="claim-actions">
                  {claim.status === 'pending' && (
                    <button type="button" className="btn btn--primary btn--small" disabled={busy}
                      onClick={() => run(() => api.claimAction(claim.id, 'accept'), `Accepted ${claim.claimant?.name}'s claim.`)}>
                      Accept claim
                    </button>
                  )}
                  {(claim.status === 'pending' || claim.status === 'accepted') && (
                    <button type="button" className="btn btn--quiet btn--small" disabled={busy}
                      onClick={() => run(() => api.claimAction(claim.id, 'reject'), 'Claim declined.')}>
                      Decline
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {item.status !== 'resolved' && (
        <div className="resolve-box">
          {confirming ? (
            <>
              <p>Mark this item as returned? Open claims will be closed and the listing stops taking new ones.</p>
              <div className="claim-actions">
                <button type="button" className="btn btn--primary" disabled={busy}
                  onClick={() => run(() => api.resolveItem(item.id), 'Marked as returned.').then(() => setConfirming(false))}>
                  Yes, mark as returned
                </button>
                <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>Keep it open</button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
              <PackageCheck size={18} aria-hidden="true" /> Mark as returned
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimForm({ verb, itemType, previous, onSubmit }: {
  verb: string;
  itemType: 'lost' | 'found';
  previous?: string;
  onSubmit: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const trimmed = message.trim();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (trimmed.length < 10) {
      setError('Write at least 10 characters so the poster can tell it is really yours.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setMessage('');
    } catch (e) {
      setError(e instanceof ApiError ? e.fields.message ?? e.message : 'Could not send the claim.');
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2 className="panel__title">{verb}</h2>
      {previous && <p className="hint">Your earlier claim was {previous === 'rejected' ? 'declined' : 'withdrawn'}. You can send a new one.</p>}
      <label className="field">
        <span>{itemType === 'found' ? 'How can you prove it is yours?' : 'Where and when did you find it?'}</span>
        <textarea
          rows={4}
          maxLength={1000}
          value={message}
          aria-invalid={Boolean(error)}
          aria-describedby="claim-help"
          placeholder={itemType === 'found'
            ? 'Describe something only the owner would know: a scratch, a sticker, what is inside.'
            : 'Tell them where it is now and how to collect it.'}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <p id="claim-help" className={error ? 'field-error' : 'hint'}>{error ?? `${trimmed.length}/1000 characters, at least 10.`}</p>
      <button type="submit" className="btn btn--primary" disabled={sending}>
        {sending ? 'Sending…' : 'Send claim'}
      </button>
    </form>
  );
}
