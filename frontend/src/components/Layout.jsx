import { Outlet, NavLink, Link } from "react-router-dom";
import { Activity, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/predict", label: "Predict" },
  { to: "/batch", label: "Batch" },
  { to: "/compare", label: "Compare" },
  { to: "/lab", label: "Lab" },
  { to: "/models", label: "Models" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/reports", label: "Reports" },
  { to: "/about", label: "About" },
];

export default function Layout() {
  const { user, logout } = useAuth() ?? {};

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header data-testid="site-header" className="border-b border-black/10 bg-[var(--bg)] sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-4">
          <Link to="/" data-testid="nav-logo" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 border border-black flex items-center justify-center" style={{ background: "var(--accent)" }}>
              <Activity size={14} strokeWidth={2.2} color="#fff"/>
            </div>
            <div className="leading-tight">
              <div className="font-serif-display text-xl">Nephrolytic</div>
              <div className="label-eyebrow text-[10px]">CKD · Decision Support</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-0.5 overflow-x-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                data-testid={`nav-${l.label.toLowerCase()}`}
                className={({ isActive }) =>
                  `px-2.5 py-2 text-[11px] uppercase tracking-widest font-mono-data transition-colors whitespace-nowrap ${
                    isActive ? "text-[var(--accent)] border-b-2 border-[var(--accent)]" : "text-[var(--text-2)] hover:text-black"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {user.picture ? (
                    <img src={user.picture} alt="" className="w-7 h-7 rounded-full border border-black/20"/>
                  ) : (
                    <div className="w-7 h-7 rounded-full border border-black/20 flex items-center justify-center"><User size={12}/></div>
                  )}
                  <span className="text-xs font-mono-data max-w-[140px] truncate" data-testid="user-email">{user.email}</span>
                </div>
                <button onClick={logout} data-testid="logout-btn" className="text-xs uppercase tracking-widest font-mono-data text-[var(--text-2)] hover:text-black inline-flex items-center gap-1">
                  <LogOut size={12}/> Logout
                </button>
              </div>
            ) : (
              <Link to="/login" data-testid="header-login-link" className="hidden md:inline-flex items-center gap-2 text-xs uppercase tracking-widest font-mono-data text-[var(--text-2)] hover:text-black">
                Sign in
              </Link>
            )}
            <Link to="/predict" data-testid="header-cta-predict" className="btn-ink hidden md:inline-block">Predict</Link>
          </div>
        </div>
      </header>

      <main className="flex-1"><Outlet /></main>

      <footer className="border-t border-black/10 mt-16">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row justify-between gap-4 text-sm">
          <div className="font-mono-data text-xs uppercase tracking-widest text-[var(--text-2)]">
            © Nephrolytic · Academic Prototype
          </div>
          <div className="text-xs text-[var(--text-2)] max-w-2xl">
            <strong className="text-black">Disclaimer:</strong> This system is an educational
            decision-support prototype and is <em>not</em> a substitute for professional medical diagnosis.
          </div>
        </div>
      </footer>
    </div>
  );
}
