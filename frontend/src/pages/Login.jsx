import { useLocation, Navigate, Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const { user, loading } = useAuth();
  const params = new URLSearchParams(useLocation().search);
  const err = params.get("error");

  if (user && !loading) return <Navigate to="/reports" replace />;

  const startLogin = () => {
    const redirectUrl = window.location.origin + "/reports";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="max-w-[900px] mx-auto px-6 md:px-10 py-16" data-testid="login-page">
      <div className="label-eyebrow">Sign in</div>
      <h1 className="font-serif-display text-5xl md:text-6xl tracking-tighter mb-4">
        Access your <span className="accent-underline">patient reports</span>.
      </h1>
      <p className="text-[var(--text-2)] max-w-xl leading-relaxed mb-10">
        Nephrolytic uses Emergent-managed Google sign-in. Once signed in you can
        save any prediction as a patient report, add a name/ID and doctor's
        notes, and revisit the full history from any device.
      </p>

      <div className="hard-border bg-white p-8 max-w-lg">
        <div className="label-eyebrow mb-3">Continue with</div>
        <button
          onClick={startLogin}
          data-testid="google-login-btn"
          className="w-full flex items-center justify-center gap-3 bg-white border border-black hover:bg-black hover:text-white transition-colors px-4 py-3 font-mono-data text-sm uppercase tracking-widest"
        >
          <LogIn size={16}/> Continue with Google
        </button>
        {err && (
          <div className="mt-4 text-sm text-[var(--risk-high)] font-mono-data">
            Login failed. Please try again.
          </div>
        )}
        <p className="mt-5 text-[11px] text-[var(--text-2)] leading-relaxed">
          By continuing you agree to the educational-only use of this prototype.
          We store your email, name, avatar, and any reports you explicitly
          save. Delete a report anytime.
        </p>
      </div>

      <div className="mt-8 text-sm">
        <Link to="/predict" className="text-accent hover:underline" data-testid="login-back-predict">
          Or run a prediction without an account →
        </Link>
      </div>
    </div>
  );
}
