import { useRef, useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Upload, Loader2, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const RISK_COLORS = { Low: "#2F8450", Medium: "#E07A15", High: "#D0342C" };

export default function Compare() {
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [labelA, setLabelA] = useState("Cohort A");
  const [labelB, setLabelB] = useState("Cohort B");
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/schema").then((r) => {
      setModels(r.data.available_models);
      setModel(r.data.best_model);
    });
  }, []);

  const compare = async () => {
    if (!fileA || !fileB) return toast.error("Upload both cohort CSVs");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file_a", fileA);
      fd.append("file_b", fileB);
      fd.append("label_a", labelA);
      fd.append("label_b", labelB);
      if (model) fd.append("model", model);
      const { data } = await api.post("/cohort-compare", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? "Compare failed");
    } finally {
      setLoading(false);
    }
  };

  const riskBars = result ? ["High", "Medium", "Low"].map((k) => ({
    band: k,
    [result.cohort_a.label]: result.cohort_a.risk_counts[k] / result.cohort_a.n,
    [result.cohort_b.label]: result.cohort_b.risk_counts[k] / result.cohort_b.n,
  })) : [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="label-eyebrow">Cohort Compare</div>
      <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mb-2">
        Two populations, side by side.
      </h1>
      <p className="text-sm text-[var(--text-2)] max-w-2xl mb-8">
        Upload two CSVs of patients and Nephrolytic will score each with the
        same model, then diff their predicted risk-band distributions and
        mean CKD probability.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <DropCard color="#0A0A0A" label="Cohort A" file={fileA} onFile={setFileA} name={labelA} onName={setLabelA} testid="compare-a"/>
          <DropCard color="#D0342C" label="Cohort B" file={fileB} onFile={setFileB} name={labelB} onName={setLabelB} testid="compare-b"/>

          <div className="hard-border bg-white p-5">
            <div className="label-eyebrow mb-2">Model</div>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full border border-black/20 px-3 py-2 text-sm" data-testid="compare-model-select">
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={compare} disabled={loading} className="btn-ink w-full mt-4 inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="compare-run">
              {loading ? <><Loader2 className="animate-spin" size={14}/> Comparing…</> : <>Compare cohorts <ArrowRight size={14}/></>}
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 space-y-4">
          {!result && (
            <div className="hard-border bg-[var(--subtle)] p-16 text-center text-[var(--text-2)]" data-testid="compare-empty">
              <div className="label-eyebrow mb-2">No comparison yet</div>
              <p className="text-sm">Upload two CSVs and click <em>Compare cohorts</em>.</p>
            </div>
          )}

          {result && (
            <>
              <div className="grid grid-cols-3 gap-3" data-testid="compare-diff-summary">
                <DiffKV label="Δ CKD rate" value={result.diff.ckd_rate_delta} percent/>
                <DiffKV label="Δ Mean prob" value={result.diff.mean_prob_delta} percent/>
                <DiffKV label="Δ High-risk share" value={result.diff.high_risk_share_b - result.diff.high_risk_share_a} percent/>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CohortCard c={result.cohort_a} accent="#0A0A0A" testid="compare-card-a"/>
                <CohortCard c={result.cohort_b} accent="#D0342C" testid="compare-card-b"/>
              </div>

              <div className="hard-border bg-white p-6" data-testid="compare-risk-chart">
                <div className="label-eyebrow mb-4">Risk-band share (proportion of each cohort)</div>
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={riskBars} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid stroke="#E2E2E0" vertical={false}/>
                      <XAxis dataKey="band" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}/>
                      <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} tickFormatter={(v) => `${(v*100).toFixed(0)}%`}/>
                      <Tooltip formatter={(v) => `${(v*100).toFixed(1)}%`}/>
                      <Legend/>
                      <Bar dataKey={result.cohort_a.label} fill="#0A0A0A"/>
                      <Bar dataKey={result.cohort_b.label} fill="#D0342C"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DropCard({ label, file, onFile, name, onName, color, testid }) {
  const ref = useRef();
  return (
    <div className="hard-border bg-white p-5" data-testid={testid}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2" style={{ background: color }}/>
          <span className="label-eyebrow">{label}</span>
        </div>
        {file && <span className="text-[10px] font-mono-data text-[var(--text-2)]">{(file.size/1024).toFixed(1)} KB</span>}
      </div>
      <input value={name} onChange={(e) => onName(e.target.value)} className="w-full border border-black/20 px-3 py-2 text-sm mb-3 font-mono-data" placeholder="Cohort label" data-testid={`${testid}-label`}/>
      <div onClick={() => ref.current?.click()}
           onDragOver={(e) => e.preventDefault()}
           onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
           className="border border-dashed border-black/30 hover:border-black cursor-pointer p-6 text-center transition-colors"
           data-testid={`${testid}-drop`}>
        <Upload size={18} className="mx-auto mb-2"/>
        <div className="font-mono-data text-xs">{file ? file.name : "Click or drop CSV"}</div>
        <input ref={ref} type="file" accept=".csv" hidden onChange={(e) => onFile(e.target.files?.[0])} data-testid={`${testid}-input`}/>
      </div>
    </div>
  );
}

function CohortCard({ c, accent, testid }) {
  return (
    <div className="hard-border bg-white p-5" data-testid={testid}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2" style={{ background: accent }}/>
        <span className="label-eyebrow">{c.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <KV k="Patients" v={c.n}/>
        <KV k="CKD" v={c.ckd}/>
        <KV k="Non-CKD" v={c.non_ckd}/>
        <KV k="Mean prob" v={`${(c.mean_probability*100).toFixed(1)}%`}/>
      </div>
      <div className="mt-3 border-t border-black/10 pt-3 flex gap-3 text-xs font-mono-data">
        {["High","Medium","Low"].map((r) => (
          <span key={r} style={{ color: RISK_COLORS[r] }}>{r}: {c.risk_counts[r]}</span>
        ))}
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return (<div><div className="text-[10px] uppercase tracking-widest text-[var(--text-2)]">{k}</div><div className="font-mono-data text-lg">{v}</div></div>);
}

function DiffKV({ label, value, percent }) {
  const up = value > 0;
  const arrow = up ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>;
  const color = up ? "#D0342C" : "#2F8450";
  return (
    <div className="hard-border bg-white p-4">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 flex items-center gap-1 font-mono-data text-xl" style={{ color }}>
        {arrow}
        {percent ? `${(value*100).toFixed(1)} pts` : value.toFixed(3)}
      </div>
    </div>
  );
}
