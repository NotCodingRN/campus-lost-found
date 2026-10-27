import { LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AuthProvider, SIGN_IN_URL, useAuth } from './auth';
import { ConnectionBanner, GoogleMark, ToastProvider, useToast } from './components';
import { AUTH_ERRORS } from './labels';
import { ActivityPage } from './pages/ActivityPage';
import { BrowsePage } from './pages/BrowsePage';
import { ItemPage } from './pages/ItemPage';
import { ReportPage } from './pages/ReportPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <a className="skip-link" href="#main">Skip to content</a>
          <ConnectionBanner />
          <Header />
          <AuthRedirectNotice />
          <main id="main">
            <Routes>
              <Route path="/" element={<BrowsePage />} />
              <Route path="/items/:id" element={<ItemPage />} />
              <Route path="/report" element={<ReportPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M9 3h14l5 5v21H4V8z" fill="var(--manila)" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="9" r="2.6" fill="var(--paper)" stroke="currentColor" strokeWidth="1.6" />
      <rect x="8" y="16" width="16" height="7" rx="1" fill="none" stroke="var(--lost)" strokeWidth="2" transform="rotate(-8 16 19.5)" />
    </svg>
  );
}

function Header() {
  const { me, loading, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const user = me?.user;

  const handleSignOut = async () => {
    try {
      await signOut();
      toast('Signed out.');
      navigate('/');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not sign out.', 'error');
    }
  };

  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link to="/" className="brand">
          <BrandMark />
          <span>Campus Lost &amp; Found</span>
        </Link>
        <nav className="main-nav" aria-label="Main">
          <NavLink to="/" end>Browse</NavLink>
          <NavLink to="/report">Report an item</NavLink>
          {user && <NavLink to="/activity">My activity</NavLink>}
        </nav>
        <div className="account">
          {loading || !me ? null : user ? (
            <>
              {user.pictureUrl ? (
                <img className="avatar" src={user.pictureUrl} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="avatar avatar--initials" aria-hidden="true">
                  {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                </span>
              )}
              <span className="account__who">
                <strong>{user.name}</strong>
                <span>{user.email}</span>
              </span>
              <button type="button" className="btn btn--quiet" onClick={handleSignOut}>
                <LogOut size={16} aria-hidden="true" /> Sign out
              </button>
            </>
          ) : me?.authConfigured ? (
            <a className="btn btn--google" href={SIGN_IN_URL}>
              <GoogleMark /> Sign in with Google
            </a>
          ) : (
            <span className="btn btn--google is-disabled" title="Google sign-in is not configured on this server">
              <GoogleMark /> Sign-in not set up
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

// After Google redirects back (/?signed_in=1 or /?auth_error=...), show the result once and clean the URL.
function AuthRedirectNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { me } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('auth_error');
    const signedIn = params.get('signed_in');
    if (!error && !signedIn) return;
    if (signedIn && !me) return; // wait until we know who signed in
    if (error) toast(AUTH_ERRORS[error] ?? 'Sign-in did not complete. Try again.', 'error');
    if (signedIn && me?.user) toast(`Signed in as ${me.user.name}.`);
    params.delete('auth_error');
    params.delete('signed_in');
    const rest = params.toString();
    navigate({ pathname: location.pathname, search: rest ? `?${rest}` : '' }, { replace: true });
  }, [location, me, navigate, toast]);

  return null;
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-inner">
        <p>
          Campus Lost &amp; Found was built for Cloud Computing Lab 4 by Alaa Aladdin and Reem Tamer.
        </p>
        <p className="footer-stack">Three containers: Nginx serves this page, Express runs the API, PostgreSQL keeps the records.</p>
      </div>
    </footer>
  );
}

function NotFound() {
  return (
    <div className="wrap page-narrow">
      <h1 className="page-title">This page is not here</h1>
      <p className="lede">The link may be old or mistyped.</p>
      <Link className="btn btn--primary" to="/">Browse all items</Link>
    </div>
  );
}
