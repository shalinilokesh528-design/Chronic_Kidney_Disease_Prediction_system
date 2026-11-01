import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Loader2, Info } from "lucide-react";

// Sample "normal" patient defaults so the form starts reasonable.
const NORMAL_DEFAULTS = {
  age: 45, bp: 80, sg: 1.02, al: 0, su: 0,
  bgr: 100, bu: 30, sc: 1.0, sod: 140, pot: 4.2,
  hemo: 14, pcv: 42, wc: 7500, rc: 5.0,
  rbc: "normal", pc: "normal", pcc: "notpresent", ba: "notpresent",
  htn: "no", dm: "no", cad: "no", appet: "good", pe: "no", ane: "no",
};

// Group features into clinical categories
const GROUPS = [
  { title: "Demographics & Vitals", keys: ["age", "bp"] },
  { title: "Urine Chemistry", keys: ["sg", "al", "su"] },
  { title: "Urinalysis (Microscopy)", keys: ["rbc", "pc", "pcc", "ba"] },
  { title: "Blood Chemistry", keys: ["bgr", "bu", "sc", "sod", "pot"] },
  { title: "Hematology", keys: ["hemo", "pcv", "wc", "rc"] },
  { title: "Comorbidities & Symptoms", keys: ["htn", "dm", "cad", "appet", "pe", "ane"] },
];

export default function Predict() {
  const [schema, setSchema] = useState(null);
  const [values, setValues] = useState(NORMAL_DEFAULTS);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/schema").then((r) => {
      setSchema(r.data);
      setModel(r.data.best_model);
    }).catch(() => toast.error("Failed to load feature schema"));
  }, []);

  const fmeta = schema?.feature_metadata ?? {};
  const groups = useMemo(() => GROUPS, []);

  const onChange = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  const loadCkdSample = () => setValues({
    age: 62, bp: 90, sg: 1.015, al: 3, su: 2,
    bgr: 180, bu: 90, sc: 4.5, sod: 132, pot: 5.2,
    hemo: 9.5, pcv: 30, wc: 9800, rc: 3.6,
    rbc: "abnormal", pc: "abnormal", pcc: "present", ba: "present",
    htn: "yes", dm: "yes", cad: "no", appet: "poor", pe: "yes", ane: "yes",
  });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/predict", { features: values, model });
      sessionStorage.setItem("ckd:last-result", JSON.stringify({ result: data, input: values }));
      nav("/result");
    } catch (err) {
      toast.error(err?.response?.data?.detail ?? "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  if (!schema) return <div className="p-16 text-center label-eyebrow">Loading schema…</div>;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-8">
        <div>
          <div className="label-eyebrow">Prediction Form</div>
          <h1 className="font-serif-display text-4xl md:text-5xl tracking-tighter">
            Clinical inputs, one probability.
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={loadCkdSample} data-testid="load-sample-ckd" className="btn-outline-ink text-[10px]">
            Load Sample · CKD
          </button>
          <button type="button" onClick={() => setValues(NORMAL_DEFAULTS)} data-testid="load-sample-normal" className="btn-outline-ink text-[10px]">
            Reset · Normal
          </button>
        </div>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-9 space-y-8">
          {groups.map((g) => (
            <fieldset key={g.title} className="hard-border bg-white p-6" data-testid={`group-${g.title.toLowerCase().replace(/\s+/g, "-")}`}>
              <legend className="label-eyebrow px-2 -ml-2">{g.title}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5 mt-4">
                {g.keys.map((k) => (
                  <Field key={k} k={k} meta={fmeta[k]} value={values[k]} onChange={onChange} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        <aside className="lg:col-span-3 space-y-4 lg:sticky lg:top-24 self-start">
          <div className="hard-border bg-white p-5">
            <div className="label-eyebrow mb-3">Model selection</div>
            <select
              data-testid="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full border border-black/20 px-3 py-2 text-sm"
            >
              {schema.available_models.map((m) => (
                <option key={m} value={m}>{m}{m === schema.best_model ? "  ★ best" : ""}</option>
              ))}
            </select>
            <p className="mt-3 text-[11px] text-[var(--text-2)] leading-relaxed">
              Defaults to the auto-selected best performer by ROC-AUC on the held-out test set.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            data-testid="predict-submit"
            className="btn-ink w-full inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? <><Loader2 className="animate-spin" size={14} /> Analyzing…</> : "Run Prediction"}
          </button>

          <div className="hard-border bg-[var(--subtle)] p-4 text-[11px] leading-relaxed text-[var(--text)]">
            <div className="label-eyebrow mb-1">Disclaimer</div>
            Predictions are educational and not a diagnosis. Do not act on this
            output without a licensed clinician.
          </div>
        </aside>
      </form>
    </div>
  );
}

function Field({ k, meta, value, onChange }) {
  if (!meta) return null;
  const isSelect = meta.type === "select";
  return (
    <label className="block" data-testid={`field-${k}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="label-eyebrow">{meta.label}</span>
        {meta.unit && <span className="text-[10px] font-mono-data text-[var(--text-2)]">{meta.unit}</span>}
      </div>
      {isSelect ? (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(k, e.target.value)}
          className="w-full border border-black/20 px-3 py-2 text-sm bg-white"
          data-testid={`input-${k}`}
        >
          {meta.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type="number"
          step={meta.step ?? 1}
          min={meta.min}
          max={meta.max}
          value={value ?? ""}
          onChange={(e) => onChange(k, e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full border border-black/20 px-3 py-2 text-sm bg-white"
          data-testid={`input-${k}`}
        />
      )}
      {meta.help && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-[var(--text-2)]">
          <Info size={10} className="mt-0.5 shrink-0" />
          <span>{meta.help}</span>
        </div>
      )}
    </label>
  );
}
