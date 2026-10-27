import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError, api } from '../api';
import { SIGN_IN_URL, useAuth } from '../auth';
import { GoogleMark, Spinner, useToast } from '../components';
import { CATEGORY_LABELS, CONTACT_LABELS } from '../labels';
import type { ContactPreference, ItemType, NewItem } from '../types';

type Errors = Partial<Record<keyof NewItem, string>>;

const today = () => new Date().toISOString().slice(0, 10);

// Mirrors the server rules so people get instant feedback; the server checks everything again.
function validate(form: NewItem): Errors {
  const errors: Errors = {};
  const title = form.title.trim();
  const description = form.description.trim();
  const location = form.location.trim();
  if (title.length < 3 || title.length > 120) errors.title = 'Give it a short name, 3 to 120 characters.';
  if (description.length < 10 || description.length > 2000) errors.description = 'Describe it in 10 to 2000 characters.';
  if (!form.category) errors.category = 'Pick the closest category.';
  if (location.length < 2 || location.length > 120) errors.location = 'Say where, 2 to 120 characters.';
  if (form.eventDate && form.eventDate > today()) errors.eventDate = 'The date cannot be in the future.';
  return errors;
}

export function ReportPage() {
  const { me, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const initialType = params.get('type') === 'found' ? 'found' : params.get('type') === 'lost' ? 'lost' : null;

  const [type, setType] = useState<ItemType | null>(initialType);
  const [form, setForm] = useState<NewItem>({
    title: '',
    description: '',
    category: '',
    itemType: initialType ?? 'lost',
    location: '',
    eventDate: today(),
    contactPreference: 'in_app',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<string[]>([]);

  useEffect(() => {
    api.meta().then((m) => setLocations(m.locations)).catch(() => {});
  }, []);

  if (loading) return <div className="wrap page-narrow"><Spinner /></div>;

  if (!me?.user) {
    return (
      <div className="wrap page-narrow">
        <h1 className="page-title">Report a lost or found item</h1>
        <p className="lede">Posting needs your university Google account, so people know a real student is behind each listing.</p>
        {me?.authConfigured ? (
          <a className="btn btn--google" href={SIGN_IN_URL}><GoogleMark /> Sign in with Google</a>
        ) : (
          <p className="notice">Google sign-in is not configured on this server yet.</p>
        )}
      </div>
    );
  }

  const set = <K extends keyof NewItem>(key: K, value: NewItem[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const chooseType = (value: ItemType) => {
    setType(value);
    set('itemType', value);
    if (value === 'lost' && form.contactPreference === 'security_desk') set('contactPreference', 'in_app');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const { item } = await api.createItem({ ...form, eventDate: form.eventDate || '' });
      toast('Listing posted.');
      navigate(`/items/${item.id}`);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields as Errors);
      setFormError(e instanceof Error ? e.message : 'Could not post the listing.');
    } finally {
      setSaving(false);
    }
  };

  const contactOptions: ContactPreference[] = type === 'found'
    ? ['in_app', 'email_on_accept', 'security_desk']
    : ['in_app', 'email_on_accept'];

  return (
    <div className="wrap page-form">
      <h1 className="page-title">Report an item</h1>
      <p className="lede">Listings are public, but your email is never shown unless you choose to share it after accepting a claim.</p>

      <div className="type-choice" role="radiogroup" aria-label="What happened?">
        <button type="button" role="radio" aria-checked={type === 'lost'} className={`type-card type-card--lost ${type === 'lost' ? 'is-on' : ''}`} onClick={() => chooseType('lost')}>
          <span className="type-card__stamp">Lost</span>
          <span>I lost something and want it back</span>
        </button>
        <button type="button" role="radio" aria-checked={type === 'found'} className={`type-card type-card--found ${type === 'found' ? 'is-on' : ''}`} onClick={() => chooseType('found')}>
          <span className="type-card__stamp">Found</span>
          <span>I found something that is not mine</span>
        </button>
      </div>

      {type && (
        <form className="report-form" onSubmit={submit} noValidate>
          <label className="field">
            <span>What is it?</span>
            <input value={form.title} maxLength={120} placeholder={type === 'lost' ? 'Black Casio calculator' : 'Set of keys on a red lanyard'}
              aria-invalid={Boolean(errors.title)} onChange={(e) => set('title', e.target.value)} />
            {errors.title && <span className="field-error">{errors.title}</span>}
          </label>

          <label className="field">
            <span>Describe it</span>
            <textarea rows={5} maxLength={2000} value={form.description}
              placeholder="Colour, brand, stickers, anything that helps the owner recognise it. Keep private details (like card numbers) out."
              aria-invalid={Boolean(errors.description)} onChange={(e) => set('description', e.target.value)} />
            {errors.description && <span className="field-error">{errors.description}</span>}
          </label>

          <div className="field-row">
            <label className="field">
              <span>Category</span>
              <select value={form.category} aria-invalid={Boolean(errors.category)} onChange={(e) => set('category', e.target.value)}>
                <option value="">Choose a category</option>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {errors.category && <span className="field-error">{errors.category}</span>}
            </label>
            <label className="field">
              <span>{type === 'lost' ? 'When did you lose it?' : 'When did you find it?'} <em>optional</em></span>
              <input type="date" value={form.eventDate} max={today()} aria-invalid={Boolean(errors.eventDate)}
                onChange={(e) => set('eventDate', e.target.value)} />
              {errors.eventDate && <span className="field-error">{errors.eventDate}</span>}
            </label>
          </div>

          <label className="field">
            <span>{type === 'lost' ? 'Where did you last have it?' : 'Where did you find it?'}</span>
            <input value={form.location} maxLength={120} list="known-locations" placeholder="Main Library, 2nd floor"
              aria-invalid={Boolean(errors.location)} onChange={(e) => set('location', e.target.value)} />
            <datalist id="known-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
            {errors.location && <span className="field-error">{errors.location}</span>}
          </label>

          <fieldset className="field">
            <legend>How should people reach you?</legend>
            <div className="contact-options">
              {contactOptions.map((value) => (
                <label key={value} className={`contact-option ${form.contactPreference === value ? 'is-on' : ''}`}>
                  <input type="radio" name="contact" value={value} checked={form.contactPreference === value}
                    onChange={() => set('contactPreference', value)} />
                  <span>
                    <strong>{CONTACT_LABELS[value].title}</strong>
                    <span>{CONTACT_LABELS[value].detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {formError && <p className="field-error form-error" role="alert">{formError}</p>}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Posting…' : 'Post listing'}</button>
            <Link to="/" className="btn btn--quiet">Cancel</Link>
          </div>
        </form>
      )}
    </div>
  );
}
