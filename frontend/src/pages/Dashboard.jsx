import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

export default function Dashboard() {
  const [eda, setEda] = useState(null);

  useEffect(() => {
    api.get("/eda").then((r) => setEda(r.data));
  }, []);

  if (!eda) return <div className="p-16 text-center label-eyebrow">Loading EDA…</div>;

  const classData = [
    { name: "CKD", value: eda.class_distribution.ckd },
    { name: "Non-CKD", value: eda.class_distribution.notckd },
  ];
  const missing = Object.entries(eda.missing_by_column)
    .map(([k, v]) => ({ feature: k, missing: v }))
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 12);

  const hemoBins = binValues(eda.hemoglobin_by_class, 3, 18, 15);
  const scBins = binValues(eda.creatinine_by_class, 0, 15, 15);

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="label-eyebrow">EDA Dashboard</div>
      <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter mb-8">The cohort, unpacked.</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="eda-stats">
        <KV k="Rows" v={eda.n_rows} />
        <KV k="Features" v={eda.n_features} />
        <KV k="CKD cases" v={eda.class_distribution.ckd} />
        <KV k="Non-CKD cases" v={eda.class_distribution.notckd} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card title="Class distribution" testid="eda-class" span="lg:col-span-4">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={classData} dataKey="value" innerRadius={60} outerRadius={90} paddingAngle={2}>
                  <Cell fill="#D0342C" />
                  <Cell fill="#2F8450" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Missingness by feature (top 12)" testid="eda-missing" span="lg:col-span-8">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={missing} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#E2E2E0" vertical={false} />
                <XAxis dataKey="feature" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="missing" fill="#E07A15" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Hemoglobin distribution by class" testid="eda-hemo" span="lg:col-span-6">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={hemoBins} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#E2E2E0" vertical={false} />
                <XAxis dataKey="bin" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="ckd" stackId="a" fill="#D0342C" />
                <Bar dataKey="notckd" stackId="a" fill="#2F8450" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Serum creatinine distribution by class" testid="eda-sc" span="lg:col-span-6">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={scBins} margin={{ left: 4, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid stroke="#E2E2E0" vertical={false} />
                <XAxis dataKey="bin" tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                <YAxis tick={{ fontFamily: "IBM Plex Mono", fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="ckd" stackId="a" fill="#D0342C" />
                <Bar dataKey="notckd" stackId="a" fill="#2F8450" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="hard-border bg-white mt-6" data-testid="eda-stats-table">
        <div className="p-4 border-b border-black/10 label-eyebrow">Numerical feature statistics</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-[var(--subtle)]">
                <th className="text-left p-3 label-eyebrow">Feature</th>
                <th className="text-right p-3 label-eyebrow">Mean</th>
                <th className="text-right p-3 label-eyebrow">Std</th>
                <th className="text-right p-3 label-eyebrow">Min</th>
                <th className="text-right p-3 label-eyebrow">Median</th>
                <th className="text-right p-3 label-eyebrow">Max</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(eda.numerical_stats).map(([k, s]) => (
                <tr key={k} className="border-b border-black/5">
                  <td className="p-3 font-mono-data">{k}</td>
                  <td className="p-3 text-right font-mono-data">{s.mean.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono-data">{s.std.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono-data">{s.min.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono-data">{s.median.toFixed(2)}</td>
                  <td className="p-3 text-right font-mono-data">{s.max.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="hard-border bg-white p-4">
      <div className="label-eyebrow">{k}</div>
      <div className="font-mono-data text-2xl">{v}</div>
    </div>
  );
}
function Card({ title, children, span, testid }) {
  return (
    <div className={`hard-border bg-white p-6 ${span}`} data-testid={testid}>
      <div className="label-eyebrow mb-4">{title}</div>
      {children}
    </div>
  );
}
function binValues(byClass, min, max, bins) {
  const step = (max - min) / bins;
  const rows = Array.from({ length: bins }, (_, i) => ({
    bin: `${(min + i * step).toFixed(1)}`,
    ckd: 0, notckd: 0,
  }));
  ["ckd", "notckd"].forEach((cls) => {
    (byClass[cls] || []).forEach((v) => {
      const i = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / step)));
      rows[i][cls] += 1;
    });
  });
  return rows;
}
