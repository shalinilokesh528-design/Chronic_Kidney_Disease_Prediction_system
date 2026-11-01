import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { AlertTriangle, ArrowLeft, RefreshCcw, Printer, Loader2, BookmarkPlus, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const RISK_COLORS = { Low: "#2F8450", Medium: "#E07A15", High: "#D0342C" };

function riskFor(prob) {
  if (prob >= 0.7) return "High";
  if (prob >= 0.3) return "Medium";
  return "Low";
}

export default function Result() {
  const [payload, setPayload] = useState(null);
  const [threshold, setThreshold] = useState(0.5);
  const [shap, setShap] = useState(null);
  const [shapLoading, setShapLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const { user } = useAuth() ?? {};
  const nav = useNavigate();

  useEffect(() => {
    const raw = sessionStorage.getItem("ckd:last-result");
    if (!raw) return nav("/predict");
    const p = JSON.parse(raw);
    setPayload(p);
    setThreshold(p.result.threshold ?? 0.5);
  }, [nav]);

  useEffect(() => {
    if (!payload) return;
    setShapLoading(true);
    api.post("/explain/shap", { features: payload.input, model: payload.result.model_used })
      .then((r) => setShap(r.data))
      .catch(() => toast.error("SHAP explanation unavailable for this model"))
      .finally(() => setShapLoading(false));
  }, [payload]);

  const dynamicVerdict = useMemo(() => {
    if (!payload) return null;
    const p = payload.result.probability;
    return {
      prediction: p >= threshold ? "CKD" : "Non-CKD",
      probability: p,
      probability_percent: Math.round(p * 10000) / 100,
      risk_level: riskFor(p),
    };
  }, [payload, threshold]);

  if (!payload || !dynamicVerdict) return null;
  const { result, input } = payload;
  const color = RISK_COLORS[dynamicVerdict.risk_level];
  const gaugeData = [
    { name: "risk", value: dynamicVerdict.probability_percent },
    { name: "rest", value: 100 - dynamicVerdict.probability_percent },
  ];

  const shapData = shap?.items?.map((it) => ({
    feature: it.feature,
    shap: it.shap,
    absShap: Math.abs(it.shap),
  })) ?? [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 print:py-0">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link to="/predict" className="text-xs uppercase tracking-widest font-mono-data text-[var(--text-2)] hover:text-black inline-flex items-center gap-2" data-testid="result-back-link">
          <ArrowLeft size={14} /> Back to form
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <button onClick={() => setSaveOpen(true)} disabled={saved} className="btn-ink inline-flex items-center gap-2 text-[11px] disabled:opacity-60" data-testid="save-report-btn">
              {saved ? <><Check size={12}/> Saved</> : <><BookmarkPlus size={12}/> Save as report</>}
            </button>
          ) : (
            <Link to="/login" className="btn-accent-outline inline-flex items-center gap-2 text-[11px]" data-testid="save-report-signin">
              <BookmarkPlus size={12}/> Sign in to save
            </Link>
          )}
          <button onClick={() => window.print()} className="btn-outline-ink inline-flex items-center gap-2 text-[11px]" data-testid="result-print-pdf">
            <Printer size={12} /> Save as PDF
          </button>
          <button onClick={() => nav("/predict")} className="btn-outline-ink inline-flex items-center gap-2 text-[11px]" data-testid="result-new-prediction">
            <RefreshCcw size={12} /> New prediction
          </button>
        </div>
      </div>

      {saveOpen && user && !saved && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" onClick={() => setSaveOpen(false)} data-testid="save-modal">
          <div className="hard-border bg-white p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="label-eyebrow mb-3">Save prediction as report</div>
            <h3 className="font-serif-display text-2xl mb-4 tracking-tighter">Tag this record.</h3>
            <label className="block mb-3">
              <span className="label-eyebrow">Patient name (optional)</span>
              <input value={patientName} onChange={(e) => setPatientName(e.target.value)} className="mt-1 w-full border border-black/20 focus:border-[var(--accent)] outline-none px-3 py-2 text-sm font-mono-data" data-testid="save-patient-name"/>
            </label>
            <label className="block mb-3">
              <span className="label-eyebrow">Patient ID (optional)</span>
              <input value={patientId} onChange={(e) => setPatientId(e.target.value)} className="mt-1 w-full border border-black/20 focus:border-[var(--accent)] outline-none px-3 py-2 text-sm font-mono-data" data-testid="save-patient-id"/>
            </label>
            <label className="block mb-4">
              <span className="label-eyebrow">Doctor's notes (optional)</span>
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full border border-black/20 focus:border-[var(--accent)] outline-none px-3 py-2 text-sm font-mono-data" data-testid="save-notes"/>
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSaveOpen(false)} className="btn-outline-ink text-[11px]" data-testid="save-cancel">Cancel</button>
              <button
                onClick={async () => {
                  setSaving(true);
                  try {
                    await api.post("/reports", {
                      patient_name: patientName || null,
                      patient_id: patientId || null,
                      notes: notes || null,
                      input: payload.input,
                      result: payload.result,
                      shap,
                    });
                    setSaved(true); setSaveOpen(false);
                    toast.success("Report saved");
                  } catch { toast.error("Save failed"); }
                  finally { setSaving(false); }
                }}
                disabled={saving}
                className="btn-ink text-[11px] inline-flex items-center gap-2"
                data-testid="save-confirm"
              >
                {saving ? <><Loader2 className="animate-spin" size={12}/> Saving…</> : "Save report"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden print:block mb-6">
        <div className="font-serif-display text-3xl">Nephrolytic — CKD Prediction Report</div>
        <div className="font-mono-data text-xs mt-1">Generated {new Date().toLocaleString()}</div>
        <hr className="my-3" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:grid-cols-2">
        {/* Verdict + Gauge */}
        <section className="lg:col-span-5 hard-border bg-white p-8" data-testid="result-verdict-card">
          <div className="label-eyebrow">Prediction</div>
          <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mt-1" data-testid="result-verdict">
            {dynamicVerdict.prediction === "CKD" ? "Chronic Kidney Disease" : "Non-CKD"}
          </h1>
          <div className="mt-4 inline-flex items-center gap-2 border border-black/20 px-3 py-1.5 text-xs font-mono-data uppercase tracking-widest" data-testid="result-model-used">
            Model · {result.model_used}
          </div>

          <div className="relative w-full mt-8" style={{ height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={gaugeData} startAngle={180} endAngle={0} innerRadius={80} outerRadius={110} paddingAngle={0} dataKey="value" stroke="none">
                  <Cell fill={color} />
                  <Cell fill="#EBEBE8" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
              <div className="font-mono-data text-5xl" data-testid="result-probability">{dynamicVerdict.probability_percent}%</div>
              <div className="label-eyebrow mt-1">CKD probability</div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <span
              className="px-4 py-1.5 text-xs uppercase tracking-widest font-mono-data border"
              style={{ background: `${color}22`, color: color, borderColor: `${color}55` }}
              data-testid="result-risk-badge"
            >
              {dynamicVerdict.risk_level} risk
            </span>
          </div>

          {/* Threshold slider */}
          <div className="mt-8 pt-6 border-t border-black/10 print:hidden" data-testid="threshold-slider-wrap">
            <div className="flex items-center justify-between mb-2">
              <span className="label-eyebrow">Decision threshold</span>
              <span className="font-mono-data text-sm">{(threshold * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range" min="0.01" max="0.99" step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-black"
              data-testid="threshold-slider"
            />
            <p className="text-[11px] text-[var(--text-2)] mt-2 leading-relaxed">
              Move the slider to see how the CKD / Non-CKD verdict shifts at
              different probability cut-offs. Default is 50%.
            </p>
          </div>
        </section>

        {/* SHAP */}
        <section className="lg:col-span-7 hard-border bg-white p-8" data-testid="result-shap">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="label-eyebrow">SHAP explanation</div>
              <h2 className="font-serif-display text-3xl mt-1 tracking-tighter">How each feature moved the model.</h2>
            </div>
            {shap?.used_fallback && (
              <span className="text-[10px] font-mono-data uppercase tracking-widest border border-black/20 px-2 py-1">
                Fallback · RF
              </span>
            )}
          </div>

          {shapLoading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-2)] py-6">
              <Loader2 className="animate-spin" size={14} /> Computing SHAP values…
            </div>
          )}
          {!shapLoading && shapData.length > 0 && (
            <div style={{ height: 360 }} data-testid="shap-chart">
              <ResponsiveContainer>
                <BarChart data={shapData} layout="vertical" margin={{ left: 90, right: 20 }}>
                  <CartesianGrid stroke="#E2E2E0" horizontal={false} />
                  <XAxis type="number" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                  <YAxis type="category" dataKey="feature" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v) => v.toFixed(4)} />
                  <ReferenceLine x={0} stroke="#111" />
                  <Bar dataKey="shap">
                    {shapData.map((d, i) => (
                      <Cell key={i} fill={d.shap > 0 ? "#D0342C" : "#2F8450"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 text-[11px] text-[var(--text-2)] leading-relaxed flex gap-2">
            <AlertTriangle size={14} className="text-[var(--risk-medium)] shrink-0 mt-0.5" />
            <span>
              Positive SHAP values push the prediction toward CKD; negative
              values push it toward Non-CKD. Base value: {shap?.base_value?.toFixed(3) ?? "—"}.
            </span>
          </div>
        </section>

        {/* Inputs recap */}
        <section className="lg:col-span-12 hard-border bg-white p-6" data-testid="result-inputs-recap">
          <div className="label-eyebrow mb-4">Inputs used</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-3">
            {Object.entries(input).map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-widest text-[var(--text-2)]">{k}</div>
                <div className="font-mono-data text-sm">{String(v)}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
