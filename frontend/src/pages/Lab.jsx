import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Play, Loader2, ScrollText, History as HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const METRIC = "roc_auc";

export default function Lab() {
  const [tab, setTab] = useState("ablation");
  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="label-eyebrow">Research Lab</div>
      <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mb-2">
        Retrain, ablate, replay.
      </h1>
      <p className="text-sm text-[var(--text-2)] max-w-2xl mb-8">
        A researcher's console — trigger a full retrain, ablate feature groups
        to see how each model responds, and inspect every recorded training run.
      </p>

      <div className="flex border-b border-black/10 mb-6" data-testid="lab-tabs">
        {[
          { k: "ablation", l: "Feature Ablation" },
          { k: "retrain",  l: "Retrain" },
          { k: "history",  l: "Training History" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            data-testid={`tab-${t.k}`}
            className={`px-4 py-3 text-xs uppercase tracking-widest font-mono-data transition-colors ${tab === t.k ? "text-black border-b border-black -mb-px" : "text-[var(--text-2)] hover:text-black"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {tab === "ablation" && <Ablation/>}
      {tab === "retrain"  && <Retrain/>}
      {tab === "history"  && <History/>}
    </div>
  );
}

// ---------------- Ablation ----------------
function Ablation() {
  const [groups, setGroups] = useState({});
  const [dropped, setDropped] = useState([]);
  const [result, setResult] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/ablation/groups").then((r) => setGroups(r.data.groups));
    api.get("/models/comparison").then((r) => setBaseline(r.data.results));
  }, []);

  const toggle = (g) => setDropped((d) => d.includes(g) ? d.filter((x) => x !== g) : [...d, g]);

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/ablation", { dropped_groups: dropped });
      setResult(data);
      if (data.error) toast.error(data.error);
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? "Ablation failed");
    } finally { setLoading(false); }
  };

  const chartData = result && !result.error ? Object.entries(result.results).map(([name, m]) => ({
    model: name,
    "Full features": baseline?.[name]?.[METRIC] ?? null,
    "Ablated": m[METRIC],
  })) : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-4 hard-border bg-white p-6" data-testid="ablation-controls">
        <div className="label-eyebrow mb-4">Toggle feature groups</div>
        <div className="space-y-2 mb-6">
          {Object.entries(groups).map(([g, cols]) => {
            const off = dropped.includes(g);
            return (
              <label key={g} className={`flex items-start gap-2 border px-3 py-2 cursor-pointer transition-colors ${off ? "border-[#D0342C] bg-[#D0342C]/5" : "border-black/20 hover:border-black"}`} data-testid={`group-${g.toLowerCase().replace(/\s+/g,'-')}`}>
                <input type="checkbox" checked={!off} onChange={() => toggle(g)} className="mt-1 accent-black"/>
                <div className="flex-1">
                  <div className="font-mono-data text-sm">{g}</div>
                  <div className="text-[10px] text-[var(--text-2)] font-mono-data">{cols.join(", ")}</div>
                </div>
                {off && <span className="text-[10px] font-mono-data text-[#D0342C]">DROPPED</span>}
              </label>
            );
          })}
        </div>
        <button onClick={run} disabled={loading} className="btn-ink w-full inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="ablation-run">
          {loading ? <><Loader2 className="animate-spin" size={14}/> Retraining…</> : "Retrain with subset"}
        </button>
        <p className="mt-3 text-[11px] text-[var(--text-2)] leading-relaxed">
          Fits 6 fast learners (LR, DT, RF, SVM, XGBoost, MLP) on-the-fly with
          the chosen feature subset. The main saved artifacts are untouched.
        </p>
      </div>

      <div className="lg:col-span-8 space-y-4">
        {!result && <div className="hard-border bg-[var(--subtle)] p-16 text-center text-[var(--text-2)]" data-testid="ablation-empty">
          <div className="label-eyebrow mb-2">No ablation run yet</div>
          <p className="text-sm">Toggle one or more feature groups off, then <em>Retrain with subset</em>.</p>
        </div>}

        {result && !result.error && (
          <>
            <div className="hard-border bg-white p-5 flex items-center justify-between" data-testid="ablation-config">
              <div>
                <div className="label-eyebrow">Configuration</div>
                <div className="text-sm font-mono-data mt-1">
                  Dropped: {result.dropped_groups.length ? result.dropped_groups.join(", ") : "none"}
                </div>
              </div>
              <div className="font-mono-data text-xs text-[var(--text-2)]">
                {result.n_train} train / {result.n_test} test
              </div>
            </div>

            <div className="hard-border bg-white p-6" data-testid="ablation-chart">
              <div className="label-eyebrow mb-4">ROC-AUC · Full vs Ablated</div>
              <div style={{ height: 340 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#E2E2E0" vertical={false}/>
                    <XAxis dataKey="model" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} angle={-15} textAnchor="end" height={70}/>
                    <YAxis domain={[0.7, 1]} tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }}/>
                    <Tooltip formatter={(v) => v?.toFixed?.(3) ?? "—"}/>
                    <Legend/>
                    <Bar dataKey="Full features" fill="#0A0A0A"/>
                    <Bar dataKey="Ablated" fill="#D0342C"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="hard-border bg-white overflow-x-auto" data-testid="ablation-table">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--subtle)]">
                  <tr><th className="text-left p-3 label-eyebrow">Model</th>
                      <th className="text-right p-3 label-eyebrow">Accuracy</th>
                      <th className="text-right p-3 label-eyebrow">Recall</th>
                      <th className="text-right p-3 label-eyebrow">F1</th>
                      <th className="text-right p-3 label-eyebrow">ROC-AUC</th></tr>
                </thead>
                <tbody>
                  {Object.entries(result.results).map(([name, m]) => (
                    <tr key={name} className="border-b border-black/5">
                      <td className="p-3 font-mono-data">{name}</td>
                      <td className="p-3 text-right font-mono-data">{m.accuracy.toFixed(3)}</td>
                      <td className="p-3 text-right font-mono-data">{m.recall.toFixed(3)}</td>
                      <td className="p-3 text-right font-mono-data">{m.f1.toFixed(3)}</td>
                      <td className="p-3 text-right font-mono-data">{m.roc_auc.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Retrain ----------------
function Retrain() {
  const [job, setJob] = useState(null);
  const [starting, setStarting] = useState(false);
  const logRef = useRef();

  const start = async () => {
    setStarting(true);
    try {
      const { data } = await api.post("/retrain/start");
      pollJob(data.job_id);
    } catch { toast.error("Failed to start retrain"); setStarting(false); }
  };

  const pollJob = (jobId) => {
    const iv = setInterval(async () => {
      try {
        const { data } = await api.get(`/retrain/status/${jobId}`);
        setJob(data);
        if (data.status !== "running") { clearInterval(iv); setStarting(false); }
      } catch { clearInterval(iv); setStarting(false); }
    }, 1500);
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job?.logs?.length]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 hard-border bg-white p-6" data-testid="retrain-panel">
        <div className="label-eyebrow mb-2">Retrain pipeline</div>
        <h3 className="font-serif-display text-2xl mb-4">Re-run all 12 models.</h3>
        <p className="text-sm text-[var(--text-2)] leading-relaxed mb-5">
          Executes <code className="font-mono-data">python -m ml.pipeline</code>{" "}
          in a background thread. Roughly 60–120 seconds on this cohort. Once
          finished the new artifacts replace the current ones and appear in the
          Training History tab.
        </p>
        <button onClick={start} disabled={starting || (job && job.status === "running")} className="btn-ink w-full inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="retrain-start">
          {(starting || job?.status === "running") ? <><Loader2 className="animate-spin" size={14}/> Training…</> : <><Play size={12}/> Start retrain</>}
        </button>
        {job && (
          <div className="mt-5 border-t border-black/10 pt-4 text-xs font-mono-data space-y-1">
            <div>Job: <span className="text-[var(--text-2)]">{job.job_id}</span></div>
            <div>Status: <span style={{ color: job.status === "success" ? "#2F8450" : job.status === "failed" ? "#D0342C" : "#0A0A0A" }}>{job.status}</span></div>
            {job.best_model && <div>Best: {job.best_model}</div>}
          </div>
        )}
      </div>

      <div className="lg:col-span-7 hard-border bg-black text-[#7CFF9B] p-4 font-mono-data text-xs" style={{ minHeight: 400 }} data-testid="retrain-logs">
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 mb-2 text-white/60">
          <ScrollText size={12}/> <span className="uppercase tracking-widest">logs</span>
        </div>
        <div ref={logRef} className="max-h-[440px] overflow-auto leading-relaxed">
          {!job && <div className="text-white/40">Waiting to start…</div>}
          {job?.logs?.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}

// ---------------- History ----------------
function History() {
  const [runs, setRuns] = useState([]);
  useEffect(() => {
    api.get("/training-history").then((r) => setRuns((r.data.runs || []).slice().reverse()));
  }, []);

  return (
    <div className="hard-border bg-white overflow-x-auto" data-testid="history-table">
      <div className="p-4 border-b border-black/10 flex items-center gap-2 label-eyebrow">
        <HistoryIcon size={12}/> Every recorded training run
      </div>
      {!runs.length && <div className="p-16 text-center text-sm text-[var(--text-2)]">No runs yet — trigger a retrain from the Retrain tab.</div>}
      {runs.length > 0 && (
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--subtle)]">
            <tr>
              <th className="text-left p-3 label-eyebrow">Run ID</th>
              <th className="text-left p-3 label-eyebrow">Timestamp (UTC)</th>
              <th className="text-left p-3 label-eyebrow">Dataset hash</th>
              <th className="text-right p-3 label-eyebrow">Rows</th>
              <th className="text-left p-3 label-eyebrow">Best model</th>
              <th className="text-right p-3 label-eyebrow">Best AUC</th>
              <th className="text-right p-3 label-eyebrow">Best F1</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const best = r.metrics?.[r.best_model] ?? {};
              return (
                <tr key={r.run_id} className="border-b border-black/5" data-testid={`history-row-${r.run_id}`}>
                  <td className="p-3 font-mono-data text-xs">{r.run_id}</td>
                  <td className="p-3 font-mono-data text-xs">{new Date(r.timestamp).toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="p-3 font-mono-data text-xs">{r.dataset_hash || "—"}</td>
                  <td className="p-3 text-right font-mono-data">{r.dataset_rows ?? "—"}</td>
                  <td className="p-3 font-mono-data">{r.best_model}</td>
                  <td className="p-3 text-right font-mono-data">{best.roc_auc?.toFixed?.(3) ?? "—"}</td>
                  <td className="p-3 text-right font-mono-data">{best.f1?.toFixed?.(3) ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
