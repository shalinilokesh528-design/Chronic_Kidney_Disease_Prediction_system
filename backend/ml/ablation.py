"""Ablation study: retrain a fast subset of models with feature groups dropped."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, accuracy_score, recall_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

from ml.pipeline import (
    CATEGORICAL_FEATURES, NUMERICAL_FEATURES, TARGET_COL, load_and_clean,
)

# Feature groups used for ablation UI toggles
FEATURE_GROUPS = {
    "Demographics": ["age"],
    "Vitals": ["bp"],
    "Urine Chemistry": ["sg", "al", "su"],
    "Urinalysis": ["rbc", "pc", "pcc", "ba"],
    "Blood Chemistry": ["bgr", "bu", "sc", "sod", "pot"],
    "Hematology": ["hemo", "pcv", "wc", "rc"],
    "Comorbidities": ["htn", "dm", "cad", "appet", "pe", "ane"],
}

RS = 42


def _fast_models() -> dict[str, Any]:
    return {
        "Logistic Regression": LogisticRegression(max_iter=1000, random_state=RS),
        "Decision Tree":       DecisionTreeClassifier(max_depth=8, random_state=RS),
        "Random Forest":       RandomForestClassifier(n_estimators=150, random_state=RS, n_jobs=-1),
        "SVM":                 SVC(kernel="rbf", probability=True, random_state=RS),
        "XGBoost":             XGBClassifier(n_estimators=150, max_depth=5, learning_rate=0.1,
                                             eval_metric="logloss", random_state=RS),
        "DNN (MLP)":           MLPClassifier(hidden_layer_sizes=(64, 32),
                                             activation="relu", max_iter=300,
                                             early_stopping=True, random_state=RS),
    }


def run_ablation(dropped_groups: list[str]) -> dict[str, Any]:
    dropped_cols: set[str] = set()
    for g in dropped_groups:
        dropped_cols.update(FEATURE_GROUPS.get(g, []))

    num = [c for c in NUMERICAL_FEATURES if c not in dropped_cols]
    cat = [c for c in CATEGORICAL_FEATURES if c not in dropped_cols]

    if not num and not cat:
        return {"error": "All features dropped — nothing to train on.",
                "dropped_groups": dropped_groups, "results": {}}

    df = load_and_clean()
    X = df[num + cat]
    y = (df[TARGET_COL].str.lower() == "ckd").astype(int).values
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=RS)

    pre = ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")),
                          ("sc",  StandardScaler())]), num),
        ("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                          ("oh",  OneHotEncoder(handle_unknown="ignore", sparse_output=False))]), cat),
    ]) if num and cat else (
        Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]) if num else
        Pipeline([("imp", SimpleImputer(strategy="most_frequent")),
                  ("oh", OneHotEncoder(handle_unknown="ignore", sparse_output=False))])
    )

    Xtr = pre.fit_transform(X_tr)
    Xte = pre.transform(X_te)

    results: dict[str, dict] = {}
    for name, m in _fast_models().items():
        m.fit(Xtr, y_tr)
        proba = m.predict_proba(Xte)[:, 1]
        pred = (proba >= 0.5).astype(int)
        results[name] = {
            "accuracy": float(accuracy_score(y_te, pred)),
            "recall":   float(recall_score(y_te, pred, zero_division=0)),
            "f1":       float(f1_score(y_te, pred, zero_division=0)),
            "roc_auc":  float(roc_auc_score(y_te, proba)),
        }

    return {
        "dropped_groups": dropped_groups,
        "kept_numerical": num,
        "kept_categorical": cat,
        "n_train": int(len(X_tr)),
        "n_test":  int(len(X_te)),
        "results": results,
    }
