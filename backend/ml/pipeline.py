"""
CKD ML/DL Pipeline
Trains multiple ML/DL models on the UCI CKD dataset and saves artifacts.
Prevents data leakage: all preprocessing fitted on training data only.
"""
from __future__ import annotations

import json
import os
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    AdaBoostClassifier,
    GradientBoostingClassifier,
    RandomForestClassifier,
    StackingClassifier,
    VotingClassifier,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BACKEND_DIR / "data" / "raw" / "ckd.csv"
ARTIFACTS_DIR = BACKEND_DIR / "artifacts"
REPORTS_DIR = BACKEND_DIR / "reports"
METRICS_DIR = REPORTS_DIR / "metrics"

for d in (ARTIFACTS_DIR / "models", ARTIFACTS_DIR / "preprocessors",
          ARTIFACTS_DIR / "metadata", METRICS_DIR, REPORTS_DIR / "figures" / "eda"):
    d.mkdir(parents=True, exist_ok=True)

RANDOM_STATE = 42

# Raw feature schema aligning with UCI CKD dataset
NUMERICAL_FEATURES = [
    "age", "bp", "sg", "al", "su", "bgr", "bu", "sc",
    "sod", "pot", "hemo", "pcv", "wc", "rc",
]
CATEGORICAL_FEATURES = [
    "rbc", "pc", "pcc", "ba", "htn", "dm", "cad", "appet", "pe", "ane",
]
TARGET_COL = "classification"

# Human-readable metadata for UI form generation
FEATURE_METADATA = {
    "age":   {"label": "Age",                       "unit": "years",  "type": "number", "min": 1,   "max": 120,  "help": "Patient age in years"},
    "bp":    {"label": "Blood Pressure",            "unit": "mm/Hg",  "type": "number", "min": 40,  "max": 220,  "help": "Diastolic blood pressure"},
    "sg":    {"label": "Specific Gravity",          "unit": "",       "type": "number", "min": 1.0, "max": 1.03, "step": 0.005, "help": "Urine specific gravity (typical range 1.005 - 1.025)"},
    "al":    {"label": "Albumin",                   "unit": "0-5",    "type": "number", "min": 0,   "max": 5,    "help": "Urine albumin level (0-5)"},
    "su":    {"label": "Sugar",                     "unit": "0-5",    "type": "number", "min": 0,   "max": 5,    "help": "Urine sugar level (0-5)"},
    "bgr":   {"label": "Blood Glucose Random",      "unit": "mg/dL",  "type": "number", "min": 20,  "max": 500,  "help": "Random blood glucose"},
    "bu":    {"label": "Blood Urea",                "unit": "mg/dL",  "type": "number", "min": 1,   "max": 400,  "help": "Blood urea nitrogen"},
    "sc":    {"label": "Serum Creatinine",          "unit": "mg/dL",  "type": "number", "min": 0.1, "max": 80,   "step": 0.1, "help": "Serum creatinine level"},
    "sod":   {"label": "Sodium",                    "unit": "mEq/L",  "type": "number", "min": 100, "max": 165,  "help": "Serum sodium concentration"},
    "pot":   {"label": "Potassium",                 "unit": "mEq/L",  "type": "number", "min": 2,   "max": 50,   "step": 0.1, "help": "Serum potassium concentration"},
    "hemo":  {"label": "Hemoglobin",                "unit": "g/dL",   "type": "number", "min": 3,   "max": 20,   "step": 0.1, "help": "Hemoglobin level"},
    "pcv":   {"label": "Packed Cell Volume",        "unit": "%",      "type": "number", "min": 9,   "max": 60,   "help": "Hematocrit"},
    "wc":    {"label": "White Blood Cell Count",    "unit": "cells/µL", "type": "number", "min": 2000, "max": 30000, "help": "WBC count"},
    "rc":    {"label": "Red Blood Cell Count",      "unit": "mil/µL", "type": "number", "min": 2,   "max": 8,    "step": 0.1, "help": "RBC count"},
    "rbc":   {"label": "Red Blood Cells",           "type": "select", "options": ["normal", "abnormal"], "help": "Microscopic RBC appearance"},
    "pc":    {"label": "Pus Cell",                  "type": "select", "options": ["normal", "abnormal"], "help": "Microscopic pus cell appearance"},
    "pcc":   {"label": "Pus Cell Clumps",           "type": "select", "options": ["notpresent", "present"], "help": "Pus cell clumps in urine"},
    "ba":    {"label": "Bacteria",                  "type": "select", "options": ["notpresent", "present"], "help": "Bacteria in urine"},
    "htn":   {"label": "Hypertension",              "type": "select", "options": ["no", "yes"], "help": "History of hypertension"},
    "dm":    {"label": "Diabetes Mellitus",         "type": "select", "options": ["no", "yes"], "help": "History of diabetes mellitus"},
    "cad":   {"label": "Coronary Artery Disease",   "type": "select", "options": ["no", "yes"], "help": "History of coronary artery disease"},
    "appet": {"label": "Appetite",                  "type": "select", "options": ["good", "poor"], "help": "Patient appetite"},
    "pe":    {"label": "Pedal Edema",               "type": "select", "options": ["no", "yes"], "help": "Swelling in the feet"},
    "ane":   {"label": "Anemia",                    "type": "select", "options": ["no", "yes"], "help": "History of anemia"},
}


def load_and_clean() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    # Strip whitespace/tabs from columns and string values
    df.columns = [c.strip() for c in df.columns]
    for c in df.select_dtypes(include="object").columns:
        df[c] = df[c].astype(str).str.strip().str.replace("\t", "", regex=False)
        df[c] = df[c].replace({"?": np.nan, "nan": np.nan, "": np.nan})

    # Coerce numerical
    for c in NUMERICAL_FEATURES:
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # Normalize target
    df[TARGET_COL] = df[TARGET_COL].str.lower().replace({
        "ckd\t": "ckd", "ckd": "ckd", "notckd": "notckd", "not ckd": "notckd",
    })
    df = df.dropna(subset=[TARGET_COL])

    # Normalize categoricals
    cat_norm = {"\tno": "no", "\tyes": "yes", " yes": "yes", "no ": "no"}
    for c in CATEGORICAL_FEATURES:
        if c in df.columns:
            df[c] = df[c].replace(cat_norm)

    if "id" in df.columns:
        df = df.drop(columns=["id"])
    return df


def build_preprocessor() -> ColumnTransformer:
    num_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])
    cat_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    return ColumnTransformer([
        ("num", num_pipe, NUMERICAL_FEATURES),
        ("cat", cat_pipe, CATEGORICAL_FEATURES),
    ])


def _metrics(y_true, y_pred, y_proba) -> dict[str, float]:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    spec = tn / (tn + fp) if (tn + fp) else 0.0
    return {
        "accuracy":  float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall":    float(recall_score(y_true, y_pred, zero_division=0)),
        "specificity": float(spec),
        "f1":        float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc":   float(roc_auc_score(y_true, y_proba)),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def train_all() -> dict[str, Any]:
    df = load_and_clean()

    X = df[NUMERICAL_FEATURES + CATEGORICAL_FEATURES]
    y = (df[TARGET_COL].str.strip().str.lower() == "ckd").astype(int).values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )

    preprocessor = build_preprocessor()
    Xtr = preprocessor.fit_transform(X_train)
    Xte = preprocessor.transform(X_test)

    feature_names = preprocessor.get_feature_names_out().tolist()

    models: dict[str, Any] = {
        "Logistic Regression": LogisticRegression(max_iter=1000, C=1.0, random_state=RANDOM_STATE),
        "Decision Tree":       DecisionTreeClassifier(max_depth=8, random_state=RANDOM_STATE),
        "Random Forest":       RandomForestClassifier(n_estimators=200, max_depth=None,
                                                      random_state=RANDOM_STATE, n_jobs=-1),
        "SVM":                 SVC(kernel="rbf", C=1.0, gamma="scale", probability=True,
                                   random_state=RANDOM_STATE),
        "XGBoost":             XGBClassifier(n_estimators=200, max_depth=5, learning_rate=0.1,
                                             subsample=0.9, colsample_bytree=0.9,
                                             eval_metric="logloss", random_state=RANDOM_STATE),
        "KNN":                 KNeighborsClassifier(n_neighbors=5),
        "Gradient Boosting":   GradientBoostingClassifier(n_estimators=150, random_state=RANDOM_STATE),
        "AdaBoost":            AdaBoostClassifier(n_estimators=150, random_state=RANDOM_STATE),
        "DNN (MLP)":           MLPClassifier(hidden_layer_sizes=(128, 64, 32, 16),
                                             activation="relu", solver="adam",
                                             batch_size=32, max_iter=400,
                                             early_stopping=True, validation_fraction=0.15,
                                             random_state=RANDOM_STATE),
    }

    results: dict[str, dict] = {}
    roc_curves: dict[str, dict] = {}
    trained: dict[str, Any] = {}

    for name, model in models.items():
        model.fit(Xtr, y_train)
        proba = model.predict_proba(Xte)[:, 1]
        pred = (proba >= 0.5).astype(int)
        results[name] = _metrics(y_test, pred, proba)
        fpr, tpr, _ = roc_curve(y_test, proba)
        # Downsample ROC points for JSON size
        idx = np.linspace(0, len(fpr) - 1, num=min(50, len(fpr))).astype(int)
        roc_curves[name] = {"fpr": fpr[idx].tolist(), "tpr": tpr[idx].tolist()}
        trained[name] = model

    # Voting Classifier (soft)
    voting = VotingClassifier(
        estimators=[
            ("lr", LogisticRegression(max_iter=1000, random_state=RANDOM_STATE)),
            ("rf", RandomForestClassifier(n_estimators=200, random_state=RANDOM_STATE, n_jobs=-1)),
            ("svm", SVC(probability=True, random_state=RANDOM_STATE)),
            ("xgb", XGBClassifier(n_estimators=200, eval_metric="logloss", random_state=RANDOM_STATE)),
        ],
        voting="soft",
    )
    voting.fit(Xtr, y_train)
    proba = voting.predict_proba(Xte)[:, 1]
    pred = (proba >= 0.5).astype(int)
    results["Voting Ensemble"] = _metrics(y_test, pred, proba)
    fpr, tpr, _ = roc_curve(y_test, proba)
    idx = np.linspace(0, len(fpr) - 1, num=min(50, len(fpr))).astype(int)
    roc_curves["Voting Ensemble"] = {"fpr": fpr[idx].tolist(), "tpr": tpr[idx].tolist()}
    trained["Voting Ensemble"] = voting

    # Stacking Classifier
    stacking = StackingClassifier(
        estimators=[
            ("rf", RandomForestClassifier(n_estimators=150, random_state=RANDOM_STATE, n_jobs=-1)),
            ("svm", SVC(probability=True, random_state=RANDOM_STATE)),
            ("xgb", XGBClassifier(n_estimators=150, eval_metric="logloss", random_state=RANDOM_STATE)),
        ],
        final_estimator=LogisticRegression(max_iter=1000, random_state=RANDOM_STATE),
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE),
        n_jobs=-1,
    )
    stacking.fit(Xtr, y_train)
    proba = stacking.predict_proba(Xte)[:, 1]
    pred = (proba >= 0.5).astype(int)
    results["Stacking Ensemble"] = _metrics(y_test, pred, proba)
    fpr, tpr, _ = roc_curve(y_test, proba)
    idx = np.linspace(0, len(fpr) - 1, num=min(50, len(fpr))).astype(int)
    roc_curves["Stacking Ensemble"] = {"fpr": fpr[idx].tolist(), "tpr": tpr[idx].tolist()}
    trained["Stacking Ensemble"] = stacking

    # DNN + XGBoost Hybrid: extract MLP penultimate embedding, train XGB on top
    from sklearn.neural_network._multilayer_perceptron import MLPClassifier as _MLP  # noqa
    dnn = trained["DNN (MLP)"]

    def dnn_embed(X_):
        # Manually forward-propagate through all-but-last layer to get embeddings
        a = X_
        for i, (W, b) in enumerate(zip(dnn.coefs_[:-1], dnn.intercepts_[:-1])):
            a = a @ W + b
            a = np.maximum(a, 0)  # ReLU
        return a

    emb_tr = dnn_embed(Xtr)
    emb_te = dnn_embed(Xte)
    hybrid = XGBClassifier(n_estimators=200, max_depth=4, learning_rate=0.1,
                           eval_metric="logloss", random_state=RANDOM_STATE)
    hybrid.fit(emb_tr, y_train)
    proba = hybrid.predict_proba(emb_te)[:, 1]
    pred = (proba >= 0.5).astype(int)
    results["DNN + XGBoost Hybrid"] = _metrics(y_test, pred, proba)
    fpr, tpr, _ = roc_curve(y_test, proba)
    idx = np.linspace(0, len(fpr) - 1, num=min(50, len(fpr))).astype(int)
    roc_curves["DNN + XGBoost Hybrid"] = {"fpr": fpr[idx].tolist(), "tpr": tpr[idx].tolist()}
    trained["DNN + XGBoost Hybrid"] = {"dnn": dnn, "xgb": hybrid}

    # Best model selection: primary metric ROC-AUC, tie-break Recall then F1
    def _score(m):
        return (m["roc_auc"], m["recall"], m["f1"])
    best_name = max(results, key=lambda n: _score(results[n]))

    # Feature importance from Random Forest for UI
    rf = trained["Random Forest"]
    fi = sorted(
        zip(feature_names, rf.feature_importances_.tolist()),
        key=lambda kv: kv[1], reverse=True,
    )[:15]
    feature_importance = [{"feature": f, "importance": float(imp)} for f, imp in fi]

    # EDA summary
    eda = {
        "n_rows": int(len(df)),
        "n_features": int(len(NUMERICAL_FEATURES) + len(CATEGORICAL_FEATURES)),
        "class_distribution": {
            "ckd": int((df[TARGET_COL].str.lower() == "ckd").sum()),
            "notckd": int((df[TARGET_COL].str.lower() == "notckd").sum()),
        },
        "missing_by_column": {c: int(df[c].isna().sum()) for c in df.columns if c != TARGET_COL},
        "numerical_stats": {
            c: {
                "mean":  float(df[c].mean(skipna=True)),
                "std":   float(df[c].std(skipna=True)),
                "min":   float(df[c].min(skipna=True)),
                "max":   float(df[c].max(skipna=True)),
                "median": float(df[c].median(skipna=True)),
            } for c in NUMERICAL_FEATURES
        },
        "hemoglobin_by_class": {
            "ckd": df.loc[df[TARGET_COL] == "ckd", "hemo"].dropna().tolist(),
            "notckd": df.loc[df[TARGET_COL] == "notckd", "hemo"].dropna().tolist(),
        },
        "creatinine_by_class": {
            "ckd": df.loc[df[TARGET_COL] == "ckd", "sc"].dropna().tolist(),
            "notckd": df.loc[df[TARGET_COL] == "notckd", "sc"].dropna().tolist(),
        },
    }

    metadata = {
        "trained_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "dataset": {"path": str(DATA_PATH), "rows": int(len(df))},
        "numerical_features": NUMERICAL_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
        "feature_metadata": FEATURE_METADATA,
        "transformed_feature_names": feature_names,
        "test_size": 0.2,
        "random_state": RANDOM_STATE,
        "best_model": best_name,
        "results": results,
        "roc_curves": roc_curves,
        "feature_importance": feature_importance,
        "eda": eda,
    }

    # Save artifacts
    joblib.dump(preprocessor, ARTIFACTS_DIR / "preprocessors" / "preprocessor.joblib")
    joblib.dump(trained, ARTIFACTS_DIR / "models" / "all_models.joblib")
    with open(ARTIFACTS_DIR / "metadata" / "model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=2, default=str)
    # Also duplicate metrics-only for /reports
    with open(METRICS_DIR / "model_comparison.json", "w") as f:
        json.dump({"results": results, "best_model": best_name}, f, indent=2)

    return metadata


if __name__ == "__main__":
    print("Training all models on UCI CKD dataset...")
    meta = train_all()
    try:
        from ml.history import record_run
        record_run(meta)
    except Exception as e:  # noqa
        print(f"[warn] history not recorded: {e}")
    print(f"[OK] Best model: {meta['best_model']}")
    for name, m in meta["results"].items():
        print(f"  {name:24s}  ACC={m['accuracy']:.3f}  AUC={m['roc_auc']:.3f}  F1={m['f1']:.3f}")
