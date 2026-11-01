# Nephrolytic — CKD Prediction Platform · PRD

## Problem Statement
Build a final-year major project titled **"Chronic Kidney Disease Prediction using Machine Learning and Deep Learning"** — a full-stack application that trains a battery of classical, ensemble, and neural learners on the UCI CKD cohort and serves probability + risk interpretation through a web UI.

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`), MongoDB (`predictions` collection for non-PHI history)
- **ML pipeline**: `/app/backend/ml/pipeline.py` — trained once, artifacts saved to `/app/backend/artifacts/{models,preprocessors,metadata}/`
- **Prediction service**: `/app/backend/ml/predict.py` — CKDPredictor, lazy-loaded on startup
- **Frontend**: React 19 + Tailwind + Recharts, editorial "Clinical Journal" aesthetic (Cormorant Garamond + IBM Plex)
- **Dataset**: UCI CKD (400 × 25) auto-downloaded to `/app/backend/data/raw/ckd.csv`

## User Personas
- **Data science / medical students**: exploring ML/DL comparison, methodology transparency
- **Faculty / evaluators**: reviewing model rigor, no-leakage claims, and reproducibility
- **Clinician (advisory only)**: sees explicit disclaimer; probabilities are educational, NOT diagnostic

## Core Requirements (static)
1. 12 models: LR, DT, RF, SVM, XGBoost, KNN, GB, AdaBoost, DNN (MLPClassifier 128-64-32-16), Voting, Stacking, DNN+XGBoost Hybrid
2. Data-leakage prevention: preprocessing fitted on train split only, ColumnTransformer wrapped pipeline
3. Evaluation: Accuracy, Precision, Recall, Specificity, F1, ROC-AUC on stratified 20% holdout
4. Best-model auto-selection by ROC-AUC → Recall → F1
5. Risk banding: Low <30%, Medium 30-70%, High ≥70%
6. Contribution attribution (RF importance × input magnitude × LR sign)
7. Prominent medical disclaimer on every page

## What's Been Implemented (2026-02)
- ✅ UCI CKD dataset auto-fetched (400 rows, 26 cols with `classification` target)
- ✅ 12 models trained; RF selected as best (AUC 1.00 on holdout)
- ✅ API: /api/health, /api/schema, /api/models/comparison, /api/eda, /api/predict, /api/predictions/history
- ✅ Frontend pages: Home, Predict, Result, Models, Dashboard (EDA), About
- ✅ Dynamic form driven by /api/schema (6 clinical fieldsets, 24 inputs, tooltips, units)
- ✅ Result page: half-donut probability gauge, colored risk badge, top 8 contributions
- ✅ Models page: comparison table with Best badge, metric bar chart, ROC curves, RF feature importance
- ✅ EDA dashboard: class distribution pie, missingness bars, hemoglobin/creatinine binned histograms
- ✅ Testing agent: 100% pass on backend + frontend
- ✅ Batch Predictions (/batch): drag-drop CSV upload, scored preview + risk-band pie + downloadable CSV
- ✅ SHAP Explanations: /api/explain/shap (TreeExplainer, RF fallback for non-tree models) + Result page bar chart
- ✅ Threshold Slider on Result page: client-side recompute of CKD/Non-CKD verdict
- ✅ PDF Report: print-friendly Result page with dedicated print CSS + Save-as-PDF button
- ✅ Cohort Compare (/compare): upload two CSVs, diff risk-band distributions + mean-probability deltas
- ✅ Feature Ablation (/lab · Feature Ablation tab): 7 toggleable feature groups, retrains 6 fast models on-the-fly, chart comparing Full vs Ablated AUC
- ✅ Retrain From UI (/lab · Retrain tab): background subprocess retrain with streaming logs terminal
- ✅ Training History Log (/lab · Training History tab): every run recorded with SHA-256 dataset hash, timestamp, best model, metrics
- ✅ Emergent Google Auth (/login, /reports): session cookie + Bearer token dual-mode; per-user report storage with patient name/ID + doctor's notes; cross-user isolation verified
- ✅ Visual polish: deep teal accent (#1D6E70) on CTAs, logo mark, active nav underline, focus states


## P1 Backlog
- SHAP force plots for individual predictions (currently using RF×input approximation)
- Retraining trigger from UI (with progress stream)
- CSV batch prediction upload
- PDF export of prediction report

## P2 Backlog
- Threshold slider on Result page
- LightGBM & CatBoost additions
- Feature-group ablation study
- Multi-lingual UI (English/Hindi)
