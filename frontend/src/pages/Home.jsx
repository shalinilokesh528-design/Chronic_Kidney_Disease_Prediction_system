import { Link } from "react-router-dom";
import { ArrowRight, Beaker, Activity, ChartLine, ShieldCheck } from "lucide-react";

export default function Home() {
  return (
    <div>
      {/* HERO */}
      <section className="border-b border-black/10 grain-bg">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-7">
            <div className="label-eyebrow mb-6" data-testid="hero-eyebrow">
              № 001 · Clinical Machine Learning · v1.0
            </div>
            <h1 className="font-serif-display text-5xl md:text-7xl leading-[0.95] tracking-tighter">
              A rigorous look at
              <br />
              <em className="italic font-light">Chronic Kidney Disease</em>
              <br />
              through 12 learned models.
            </h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-[var(--text-2)]">
              Nephrolytic trains Logistic Regression, Decision Tree, Random Forest,
              SVM, XGBoost, a Deep Neural Network, Voting, Stacking, and a
              DNN + XGBoost hybrid on the labeled UCI CKD cohort — then serves
              transparent probabilities with risk interpretation.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link to="/predict" data-testid="hero-cta-predict" className="btn-ink inline-flex items-center gap-2">
                Start Prediction <ArrowRight size={14} />
              </Link>
              <Link to="/models" data-testid="hero-cta-models" className="btn-outline-ink">
                View Model Comparison
              </Link>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="hard-border bg-white p-6 md:p-8">
              <div className="label-eyebrow mb-4">Cohort at a glance</div>
              <div className="grid grid-cols-2 gap-6">
                <Stat k="400" v="Patients" />
                <Stat k="24" v="Clinical features" />
                <Stat k="12" v="Models trained" />
                <Stat k="AUC 1.00" v="Best on holdout" />
              </div>
              <div className="mt-8 border-t border-black/10 pt-6">
                <p className="text-xs text-[var(--text-2)] leading-relaxed font-mono-data">
                  Dataset: UCI Machine Learning Repository —
                  <br />
                  <span className="text-black">Chronic Kidney Disease (400 × 25).</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 py-20">
        <div className="label-eyebrow mb-3">Workflow</div>
        <h2 className="font-serif-display text-4xl md:text-5xl mb-12 tracking-tighter">
          From raw urine chemistry to interpretable risk.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 stagger">
          <Step n="01" title="Data Validation" body="Schema check, missing-value audit, categorical normalization, duplicate detection." icon={<Beaker size={18} />} />
          <Step n="02" title="Preprocessing" body="Training-only imputation, one-hot encoding and standardization inside a leak-proof pipeline." icon={<Activity size={18} />} />
          <Step n="03" title="Modeling" body="9 base learners + Voting + Stacking + DNN-XGBoost hybrid evaluated on an untouched test split." icon={<ChartLine size={18} />} />
          <Step n="04" title="Interpretation" body="Probability, risk band, top contributing features. Educational, not diagnostic." icon={<ShieldCheck size={18} />} />
        </div>
      </section>

      {/* DISCLAIMER STRIP */}
      <section className="border-y border-black/10 bg-[var(--subtle)]">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <p className="max-w-3xl text-sm text-[var(--text)]">
            <strong>Medical disclaimer.</strong> Nephrolytic is an educational
            decision-support prototype built for academic demonstration.
            Predicted probabilities are not a diagnosis and must not be treated
            as CKD clinical staging.
          </p>
          <Link to="/about" data-testid="home-about-link" className="btn-outline-ink">Read methodology</Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ k, v }) {
  return (
    <div>
      <div className="font-mono-data text-3xl md:text-4xl leading-none">{k}</div>
      <div className="mt-2 text-xs uppercase tracking-widest text-[var(--text-2)]">{v}</div>
    </div>
  );
}

function Step({ n, title, body, icon }) {
  return (
    <div className="hard-border bg-white p-6 hover:border-black transition-colors" data-testid={`workflow-step-${n}`}>
      <div className="flex items-center justify-between mb-6">
        <span className="font-mono-data text-xs text-[var(--text-2)]">{n}</span>
        <span className="text-black">{icon}</span>
      </div>
      <div className="font-serif-display text-2xl mb-2">{title}</div>
      <p className="text-sm text-[var(--text-2)] leading-relaxed">{body}</p>
    </div>
  );
}
