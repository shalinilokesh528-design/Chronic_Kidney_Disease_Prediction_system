import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Trash2, Save, FileText, Loader2, User, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const RISK_COLORS = { Low: "#2F8450", Medium: "#E07A15", High: "#D0342C" };

export default function Reports() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [editingNotes, setEditingNotes] = useState({});

  useEffect(() => {
    if (!user) return;
    api.get("/reports", { withCredentials: true })
      .then((r) => setItems(r.data.items))
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setFetching(false));
  }, [user]);

  if (loading) return <div className="p-16 text-center label-eyebrow">Checking session…</div>;
  if (!user) return <Navigate to="/login" replace />;

  const saveNotes = async (id) => {
    try {
      await api.patch(`/reports/${id}/notes`, { notes: editingNotes[id] ?? "" }, { withCredentials: true });
      setItems((rs) => rs.map((r) => r.report_id === id ? { ...r, notes: editingNotes[id] } : r));
      toast.success("Notes saved");
    } catch { toast.error("Save failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this report?")) return;
    try {
      await api.delete(`/reports/${id}`, { withCredentials: true });
      setItems((rs) => rs.filter((r) => r.report_id !== id));
    } catch { toast.error("Delete failed"); }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="flex items-end justify-between mb-8 gap-4">
        <div>
          <div className="label-eyebrow flex items-center gap-2">
            <User size={12}/> Signed in · <span className="text-black normal-case">{user.email}</span>
          </div>
          <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mt-1">
            Your <span className="accent-underline">patient reports</span>.
          </h1>
          <p className="text-sm text-[var(--text-2)] mt-2">{items.length} saved report{items.length === 1 ? "" : "s"}.</p>
        </div>
        <Link to="/predict" className="btn-ink" data-testid="reports-new-btn">New prediction</Link>
      </div>

      {fetching && <div className="p-16 text-center text-sm text-[var(--text-2)]"><Loader2 className="inline animate-spin" size={14}/> Loading…</div>}

      {!fetching && items.length === 0 && (
        <div className="hard-border bg-[var(--subtle)] p-16 text-center" data-testid="reports-empty">
          <FileText className="mx-auto mb-3" size={22}/>
          <div className="label-eyebrow mb-2">No reports yet</div>
          <p className="text-sm text-[var(--text-2)] max-w-md mx-auto">
            Run a prediction from the <Link to="/predict" className="text-accent hover:underline">Predict page</Link> and
            click <em>Save as report</em> on the result to keep it here.
          </p>
        </div>
      )}

      {!fetching && items.length > 0 && (
        <div className="space-y-3" data-testid="reports-list">
          {items.map((r) => {
            const risk = r.result?.risk_level;
            const prob = r.result?.probability_percent;
            const open = openId === r.report_id;
            return (
              <div key={r.report_id} className="hard-border bg-white" data-testid={`report-${r.report_id}`}>
                <button
                  onClick={() => setOpenId(open ? null : r.report_id)}
                  className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-[var(--subtle)] transition-colors"
                  data-testid={`report-toggle-${r.report_id}`}
                >
                  {open ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-mono-data text-sm truncate">
                        {r.patient_name || <span className="text-[var(--text-2)]">Unnamed patient</span>}
                      </div>
                      {r.patient_id && <span className="text-[10px] font-mono-data text-[var(--text-2)]">· {r.patient_id}</span>}
                    </div>
                    <div className="text-[11px] font-mono-data text-[var(--text-2)]">
                      {new Date(r.created_at).toLocaleString()} · {r.result?.model_used}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-data text-lg" style={{ color: RISK_COLORS[risk] || "#111" }}>{prob != null ? `${prob}%` : "—"}</div>
                    <div className="text-[10px] uppercase tracking-widest" style={{ color: RISK_COLORS[risk] || "#111" }}>{risk}</div>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-black/10 p-5 grid grid-cols-1 md:grid-cols-2 gap-6" data-testid={`report-body-${r.report_id}`}>
                    <div>
                      <div className="label-eyebrow mb-2">Prediction</div>
                      <div className="font-serif-display text-2xl">{r.result?.prediction}</div>
                      <div className="mt-2 text-xs font-mono-data text-[var(--text-2)]">Model · {r.result?.model_used}</div>
                      <div className="mt-6 label-eyebrow mb-2">Inputs</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {Object.entries(r.input || {}).map(([k, v]) => (
                          <div key={k}>
                            <div className="text-[10px] uppercase tracking-widest text-[var(--text-2)]">{k}</div>
                            <div className="font-mono-data">{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="label-eyebrow mb-2">Doctor's notes</div>
                      <textarea
                        rows={7}
                        value={editingNotes[r.report_id] ?? r.notes ?? ""}
                        onChange={(e) => setEditingNotes((s) => ({ ...s, [r.report_id]: e.target.value }))}
                        placeholder="Add observations, follow-up actions, differential diagnoses…"
                        className="w-full border border-black/20 focus:border-[var(--accent)] outline-none px-3 py-2 text-sm font-mono-data"
                        data-testid={`notes-${r.report_id}`}
                      />
                      <div className="mt-3 flex items-center gap-2">
                        <button onClick={() => saveNotes(r.report_id)} className="btn-ink inline-flex items-center gap-2 text-[11px]" data-testid={`save-notes-${r.report_id}`}>
                          <Save size={12}/> Save notes
                        </button>
                        <button onClick={() => remove(r.report_id)} className="btn-outline-ink inline-flex items-center gap-2 text-[11px] hover:bg-[var(--risk-high)] hover:text-white hover:border-[var(--risk-high)]" data-testid={`delete-${r.report_id}`}>
                          <Trash2 size={12}/> Delete report
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
