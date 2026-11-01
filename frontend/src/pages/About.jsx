import { Link } from "react-router-dom";

export default function About() {
  return (
    <div className="max-w-[1200px] mx-auto px-6 md:px-10 py-14">
      <div className="label-eyebrow">About</div>
      <h1 className="font-serif-display text-5xl md:text-6xl tracking-tighter mb-6">
        Methodology, in the open.
      </h1>
      <p className="text-[var(--text-2)] max-w-2xl leading-relaxed">
        Nephrolytic is an academic decision-support prototype that trains a
        battery of classical, ensemble, and neural learners on the UCI Chronic
        Kidney Disease cohort — with strict data-leakage prevention and a
        transparent selection criterion.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mt-12">
        <Section title="Problem" span="md:col-span-6">
          Early identification of Chronic Kidney Disease from routine clinical
          markers. Given a limited cohort (~400 patients, 24 features), we
          benchmark twelve classifiers to understand accuracy vs. interpretability.
        </Section>
        <Section title="Dataset" span="md:col-span-6">
          UCI Machine Learning Repository — Chronic Kidney Disease (400 × 25).
          Features: demographics, urine chemistry, urinalysis microscopy, blood
          chemistry, hematology, comorbidities. Target: <code>ckd / notckd</code>.
        </Section>

        <Section title="Preprocessing" span="md:col-span-6">
          Column-name normalization, string trimming, malformed-numeric coercion,
          median (numerical) & most-frequent (categorical) imputation,
          one-hot encoding, standard scaling. All imputers, encoders, and
          scalers are <strong>fit on training data only</strong> and wrapped in a
          scikit-learn ColumnTransformer.
        </Section>
        <Section title="Feature engineering" span="md:col-span-6">
          Correlation analysis, L1-regularized logistic regression coefficients,
          and Random Forest feature importance are computed. The identifier
          column <code>id</code> is discarded to prevent leakage.
        </Section>

        <Section title="Models trained" span="md:col-span-12">
          <ul className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 font-mono-data text-sm list-disc pl-5">
            <li>Logistic Regression</li>
            <li>Decision Tree</li>
            <li>Random Forest</li>
            <li>Support Vector Machine (RBF)</li>
            <li>K-Nearest Neighbors</li>
            <li>Gradient Boosting</li>
            <li>AdaBoost</li>
            <li>XGBoost</li>
            <li>Deep Neural Network (MLP 128-64-32-16)</li>
            <li>Voting Ensemble (LR + RF + SVM + XGB, soft)</li>
            <li>Stacking Ensemble (RF + SVM + XGB → LR meta)</li>
            <li>DNN + XGBoost Hybrid (MLP embeddings → XGB)</li>
          </ul>
        </Section>

        <Section title="Evaluation" span="md:col-span-6">
          Stratified 80/20 split. Metrics: Accuracy, Precision, Recall,
          Specificity, F1, ROC-AUC. Confusion counts (TN/FP/FN/TP) preserved.
          Best model automatically selected by ROC-AUC → Recall → F1.
        </Section>
        <Section title="Prediction pipeline" span="md:col-span-6">
          Raw input → schema validation → fitted preprocessor → chosen model →
          probability → risk band (Low <em>&lt;30%</em> · Medium <em>30–70%</em> ·
          High <em>≥70%</em>) → contribution attribution.
        </Section>

        <Section title="Tech stack" span="md:col-span-6">
          FastAPI · scikit-learn · XGBoost · MLPClassifier (Keras-equivalent DNN)
          · MongoDB · React 19 · Recharts · Tailwind. Typography by IBM Plex and
          Cormorant Garamond.
        </Section>
        <Section title="Limitations" span="md:col-span-6">
          Small cohort (n=400); binary label; UCI dataset is not sampled from
          every population. Reported metrics reflect this dataset only and do
          <strong> not</strong> imply generalization to clinical practice.
        </Section>

        <Section title="Medical disclaimer" span="md:col-span-12">
          <p className="text-[var(--text)]">
            <strong>Nephrolytic is not a medical device.</strong> Nothing on this
            site constitutes medical advice, diagnosis, or treatment. The
            &ldquo;probability&rdquo; and &ldquo;risk level&rdquo; are outputs of statistical models
            and must never be interpreted as CKD clinical staging. Consult a
            licensed nephrologist for clinical decisions.
          </p>
        </Section>
      </div>

      <div className="mt-12 flex gap-3">
        <Link to="/predict" data-testid="about-cta-predict" className="btn-ink">Try a prediction</Link>
        <Link to="/models" data-testid="about-cta-models" className="btn-outline-ink">See model results</Link>
      </div>
    </div>
  );
}

function Section({ title, children, span }) {
  return (
    <section className={`hard-border bg-white p-8 ${span}`}>
      <div className="label-eyebrow mb-3">{title}</div>
      <div className="text-[var(--text)] leading-relaxed text-sm md:text-[15px]">{children}</div>
    </section>
  );
}
