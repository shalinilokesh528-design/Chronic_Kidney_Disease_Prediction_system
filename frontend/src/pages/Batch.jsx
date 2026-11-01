import { useEffect, useRef, useState } from "react";
import { api, API } from "@/lib/api";
import { Upload, Download, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const RISK_COLORS = { Low: "#2F8450", Medium: "#E07A15", High: "#D0342C" };

export default function Batch() {
  const [file, setFile] = useState(null);
  const [model, setModel] = useState("");
  const [models, setModels] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    api.get("/schema").then((r) => {
      setModels(r.data.available_models);
      setModel(r.data.best_model);
    });
  }, []);

  const onFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const score = async () => {
    if (!file) return toast.error("Choose a CSV first");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (model) fd.append("model", model);
      const { data } = await api.post("/batch-predict", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(data);
      toast.success(`Scored ${data.n} patients`);
    } catch (e) {
      toast.error(e?.response?.data?.detail ?? "Batch prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const download = async () => {
    if (!file) return;
    setDownloading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (model) fd.append("model", model);
      const res = await axios.post(`${API}/batch-predict/download`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "ckd_predictions.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const riskData = result ? [
    { name: "High", value: result.risk_counts.High },
    { name: "Medium", value: result.risk_counts.Medium },
    { name: "Low", value: result.risk_counts.Low },
  ] : [];

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="label-eyebrow">Batch Predictions</div>
      <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mb-2">
        Upload a cohort, get a scored report.
      </h1>
      <p className="text-sm text-[var(--text-2)] max-w-2xl mb-8">
        Drop a CSV with the same column schema as the UCI CKD dataset
        (missing values are OK — the imputer handles them). Nephrolytic returns
        per-row CKD probability, risk band, and a downloadable scored file.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload */}
        <div className="lg:col-span-5 hard-border bg-white p-6" data-testid="batch-upload-card">
          <div className="label-eyebrow mb-4">Upload cohort CSV</div>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
            className="border border-dashed border-black/30 hover:border-black cursor-pointer p-8 text-center transition-colors"
            data-testid="batch-dropzone"
          >
            <Upload size={22} className="mx-auto mb-3" />
            <div className="font-mono-data text-sm">
              {file ? file.name : "Click or drop CSV file here"}
            </div>
            {file && (
              <div className="text-[11px] text-[var(--text-2)] mt-1 font-mono-data">
                {(file.size / 1024).toFixed(1)} KB
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={(e) => onFile(e.target.files?.[0])}
              data-testid="batch-file-input"
            />
          </div>

          <div className="mt-5">
            <div className="label-eyebrow mb-2">Model</div>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full border border-black/20 px-3 py-2 text-sm" data-testid="batch-model-select">
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={score} disabled={!file || loading} className="btn-ink inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="batch-score-btn">
              {loading ? <><Loader2 className="animate-spin" size={14} /> Scoring…</> : "Score cohort"}
            </button>
            <button onClick={download} disabled={!file || downloading} className="btn-outline-ink inline-flex items-center justify-center gap-2 disabled:opacity-50" data-testid="batch-download-btn">
              {downloading ? <><Loader2 className="animate-spin" size={14} /> …</> : <><Download size={12} /> CSV</>}
            </button>
          </div>

          <div className="mt-6 border-t border-black/10 pt-4 text-[11px] text-[var(--text-2)] leading-relaxed">
            <div className="label-eyebrow mb-1 flex items-center gap-1"><FileText size={11}/> Expected schema</div>
            age, bp, sg, al, su, bgr, bu, sc, sod, pot, hemo, pcv, wc, rc, rbc, pc, pcc, ba, htn, dm, cad, appet, pe, ane
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-7 space-y-6">
          {!result && (
            <div className="hard-border bg-[var(--subtle)] p-16 text-center text-[var(--text-2)]" data-testid="batch-empty">
              <div className="label-eyebrow mb-2">No cohort scored yet</div>
              <p className="text-sm max-w-md mx-auto">Upload a CSV and click <em>Score cohort</em> to see a distribution of risk bands and a preview of scored rows.</p>
            </div>
          )}

          {result && (
            <>
              <div className="grid grid-cols-4 gap-3" data-testid="batch-summary">
                <KV k="Rows" v={result.n} />
                <KV k="CKD" v={result.ckd} c="#D0342C" />
                <KV k="Non-CKD" v={result.non_ckd} c="#2F8450" />
                <KV k="Model" v={result.model_used} mono/>
              </div>

              <div className="hard-border bg-white p-6" data-testid="batch-risk-chart">
                <div className="label-eyebrow mb-4">Risk band distribution</div>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={riskData} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {riskData.map((d) => <Cell key={d.name} fill={RISK_COLORS[d.name]} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="hard-border bg-white overflow-x-auto" data-testid="batch-preview-table">
                <div className="p-4 border-b border-black/10 label-eyebrow">Preview (first 20 rows)</div>
                <table className="min-w-full text-xs">
                  <thead className="bg-[var(--subtle)]">
                    <tr>
                      <th className="text-left p-2 label-eyebrow">#</th>
                      <th className="text-right p-2 label-eyebrow">Prob %</th>
                      <th className="text-left p-2 label-eyebrow">Prediction</th>
                      <th className="text-left p-2 label-eyebrow">Risk</th>
                      <th className="text-right p-2 label-eyebrow">age</th>
                      <th className="text-right p-2 label-eyebrow">bp</th>
                      <th className="text-right p-2 label-eyebrow">sc</th>
                      <th className="text-right p-2 label-eyebrow">hemo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 20).map((r, i) => (
                      <tr key={i} className="border-b border-black/5">
                        <td className="p-2 font-mono-data">{i + 1}</td>
                        <td className="p-2 text-right font-mono-data">{r.ckd_probability_percent}</td>
                        <td className="p-2 font-mono-data">{r.prediction}</td>
                        <td className="p-2 font-mono-data" style={{ color: RISK_COLORS[r.risk_level] }}>{r.risk_level}</td>
                        <td className="p-2 text-right font-mono-data">{fmt(r.age)}</td>
                        <td className="p-2 text-right font-mono-data">{fmt(r.bp)}</td>
                        <td className="p-2 text-right font-mono-data">{fmt(r.sc)}</td>
                        <td className="p-2 text-right font-mono-data">{fmt(r.hemo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(v) { return v === null || v === undefined ? "—" : v; }
function KV({ k, v, c, mono }) {
  return (
    <div className="hard-border bg-white p-4">
      <div className="label-eyebrow">{k}</div>
      <div className={`text-2xl ${mono ? "font-mono-data text-sm mt-1 break-all" : "font-mono-data"}`} style={c ? { color: c } : {}}>{v}</div>
    </div>
  );
}
