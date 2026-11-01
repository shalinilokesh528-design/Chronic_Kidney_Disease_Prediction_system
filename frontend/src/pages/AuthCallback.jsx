import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const nav = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash;
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) { nav("/login"); return; }
    const sessionId = m[1];

    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id: sessionId }, {
          withCredentials: true,
        });
        setUser(data);
        // Wipe the fragment so a reload doesn't retry the exchange
        window.history.replaceState({}, "", window.location.pathname);
        nav("/reports", { replace: true, state: { user: data } });
      } catch (e) {
        console.error(e);
        nav("/login?error=1", { replace: true });
      }
    })();
  }, [nav, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-[var(--text-2)]">
        <Loader2 className="animate-spin" size={16} /> Establishing session…
      </div>
    </div>
  );
}
