import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend,
} from "recharts";

const METRIC_KEYS = ["accuracy", "precision", "recall", "specificity", "f1", "roc_auc"];
const METRIC_LABELS = {
  accuracy: "Accuracy", precision: "Precision", recall: "Recall",
  specificity: "Specificity", f1: "F1", roc_auc: "ROC-AUC",
};

const CHART_COLORS = ["#0A0A0A", "#D0342C", "#E07A15", "#2F8450", "#1E3A8A", "#701A75", "#92400E", "#3F6212", "#475569", "#0891B2", "#B91C1C", "#166534"];

export default function Models() {
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState("roc_auc");

  useEffect(() => {
    api.get("/models/comparison").then((r) => setData(r.data));
  }, []);

  if (!data) return <div className="p-16 text-center label-eyebrow">Loading model results…</div>;

  const rows = Object.entries(data.results).map(([name, m]) => ({ name, ...m }));
  const barData = rows.map((r) => ({ name: r.name, value: r[metric] }));
  const rocData = buildRoc(data.roc_curves);

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="label-eyebrow">Model Comparison</div>
      <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mb-2">
        Twelve estimators on one holdout.
      </h1>
      <p className="text-sm text-[var(--text-2)] max-w-2xl mb-8">
        Metrics computed on a stratified 20% test partition never touched during
        training. Best model auto-selected by ROC-AUC → Recall → F1.
      </p>

      {/* Comparison Table */}
      <div className="hard-border bg-white overflow-x-auto mb-10" data-testid="models-table">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--subtle)]">
              <th className="text-left p-3 label-eyebrow">Model</th>
              {METRIC_KEYS.map((k) => (
                <th key={k} className="text-right p-3 label-eyebrow">{METRIC_LABELS[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isBest = r.name === data.best_model;
              return (
                <tr key={r.name} className={`border-b border-black/5 ${isBest ? "bg-[var(--subtle)]" : ""}`} data-testid={`row-${r.name}`}>
                  <td className="p-3 font-mono-data">
                    {r.name}
                    {isBest && (
                      <span className="ml-2 text-[10px] uppercase tracking-widest border border-black px-1.5 py-0.5">Best</span>
                    )}
                  </td>
                  {METRIC_KEYS.map((k) => (
                    <td key={k} className="p-3 text-right font-mono-data">{r[k].toFixed(3)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 hard-border bg-white p-6" data-testid="models-bar">
          <div className="flex items-center justify-between mb-4">
            <div className="label-eyebrow">Metric comparison</div>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="border border-black/20 px-2 py-1 text-xs font-mono-data" data-testid="metric-select">
              {METRIC_KEYS.map((k) => <option key={k} value={k}>{METRIC_LABELS[k]}</option>)}
            </select>
          </div>
          <div style={{ height: 380 }}>
            <ResponsiveContainer>
              <BarChart data={barData} layout="vertical" margin={{ left: 40, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#E2E2E0" horizontal={false} />
                <XAxis type="number" domain={[0.9, 1.0]} tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} width={140} />
                <Tooltip formatter={(v) => v.toFixed(3)} />
                <Bar dataKey="value" fill="#0A0A0A" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 hard-border bg-white p-6" data-testid="models-roc">
          <div className="label-eyebrow mb-4">ROC curves</div>
          <div style={{ height: 380 }}>
            <ResponsiveContainer>
              <LineChart data={rocData} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                <CartesianGrid stroke="#E2E2E0" />
                <XAxis dataKey="fpr" type="number" domain={[0, 1]} tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} label={{ value: "FPR", position: "insideBottom", offset: -2, fontSize: 10 }} />
                <YAxis type="number" domain={[0, 1]} tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} label={{ value: "TPR", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <Tooltip />
                {Object.keys(data.roc_curves).map((name, i) => (
                  <Line key={name} type="monotone" dataKey={name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Feature importance */}
      <div className="hard-border bg-white p-6 mt-6" data-testid="feature-importance">
        <div className="label-eyebrow mb-4">Random Forest — top 15 features</div>
        <div style={{ height: 340 }}>
          <ResponsiveContainer>
            <BarChart data={data.feature_importance} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid stroke="#E2E2E0" horizontal={false} />
              <XAxis type="number" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
              <YAxis type="category" dataKey="feature" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} width={110} />
              <Tooltip />
              <Bar dataKey="importance" fill="#0A0A0A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function buildRoc(rocCurves) {
  // Merge all curves onto a common fpr grid by index
  const names = Object.keys(rocCurves);
  const maxLen = Math.max(...names.map((n) => rocCurves[n].fpr.length));
  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    const row = { fpr: rocCurves[names[0]].fpr[i] ?? 1 };
    names.forEach((n) => { row[n] = rocCurves[n].tpr[i] ?? null; });
    rows.push(row);
  }
  return rows;
}
