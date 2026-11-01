"""Prediction service: loads artifacts and produces CKD probability + risk + explainability."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parent.parent
ART = BACKEND_DIR / "artifacts"


class CKDPredictor:
    def __init__(self):
        self.preprocessor = joblib.load(ART / "preprocessors" / "preprocessor.joblib")
        self.models = joblib.load(ART / "models" / "all_models.joblib")
        with open(ART / "metadata" / "model_metadata.json") as f:
            self.metadata = json.load(f)
        self.best_name = self.metadata["best_model"]
        self.feature_names = self.metadata["transformed_feature_names"]
        self.num_features = self.metadata["numerical_features"]
        self.cat_features = self.metadata["categorical_features"]
        self._shap_cache: dict[str, Any] = {}

    def _shap_explainer(self, model_name: str):
        """Lazy-build a SHAP TreeExplainer for tree-based models."""
        if model_name in self._shap_cache:
            return self._shap_cache[model_name]
        import shap
        tree_supported = {"Random Forest", "XGBoost", "Decision Tree",
                          "Gradient Boosting", "AdaBoost"}
        if model_name not in tree_supported:
            self._shap_cache[model_name] = None
            return None
        try:
            explainer = shap.TreeExplainer(self.models[model_name])
        except Exception:  # noqa
            explainer = None
        self._shap_cache[model_name] = explainer
        return explainer

    def shap_values(self, payload: dict[str, Any], model_name: str | None = None) -> dict[str, Any]:
        model_name = model_name or self.best_name
        # SHAP works cleanly on tree models; fall back to RF if not supported
        explainer = self._shap_explainer(model_name)
        used_fallback = False
        if explainer is None:
            model_name = "Random Forest"
            explainer = self._shap_explainer(model_name)
            used_fallback = True
        X = self._to_matrix(payload)
        raw = explainer.shap_values(X)
        # sklearn RF returns list-per-class; XGB returns array
        if isinstance(raw, list):
            values = np.asarray(raw[1])[0]
            base = float(explainer.expected_value[1]) if hasattr(explainer, "expected_value") else 0.0
        else:
            arr = np.asarray(raw)
            if arr.ndim == 3:
                values = arr[0, :, 1]
            else:
                values = arr[0]
            base = float(np.atleast_1d(explainer.expected_value)[-1])
        items = [
            {
                "feature": n.replace("num__", "").replace("cat__", ""),
                "value": float(v),
                "shap": float(s),
            }
            for n, v, s in zip(self.feature_names, X[0], values)
        ]
        items.sort(key=lambda r: abs(r["shap"]), reverse=True)
        return {
            "model_used": model_name,
            "base_value": base,
            "used_fallback": used_fallback,
            "items": items[:12],
        }

    def _to_matrix(self, payload: dict[str, Any]) -> np.ndarray:
        row = {}
        for f in self.num_features:
            v = payload.get(f)
            row[f] = float(v) if v not in (None, "") else np.nan
        for f in self.cat_features:
            v = payload.get(f)
            row[f] = str(v).strip().lower() if v not in (None, "") else np.nan
        return self.preprocessor.transform(pd.DataFrame([row]))

    def predict_batch(self, df_raw: pd.DataFrame, model_name: str | None = None) -> pd.DataFrame:
        model_name = model_name or self.best_name
        if model_name not in self.models:
            raise ValueError(f"Unknown model: {model_name}")
        # Normalize headers / string values same as pipeline
        df = df_raw.copy()
        df.columns = [c.strip() for c in df.columns]
        for c in df.select_dtypes(include="object").columns:
            df[c] = df[c].astype(str).str.strip().str.lower()
            df[c] = df[c].replace({"?": np.nan, "nan": np.nan, "": np.nan})
        needed_num = [c for c in self.num_features]
        needed_cat = [c for c in self.cat_features]
        # Add any missing cols as NaN so imputer handles them
        for c in needed_num + needed_cat:
            if c not in df.columns:
                df[c] = np.nan
        for c in needed_num:
            df[c] = pd.to_numeric(df[c], errors="coerce")
        X = self.preprocessor.transform(df[needed_num + needed_cat])

        m = self.models[model_name]
        if model_name == "DNN + XGBoost Hybrid":
            dnn = m["dnn"]
            a = X
            for W, b in zip(dnn.coefs_[:-1], dnn.intercepts_[:-1]):
                a = np.maximum(a @ W + b, 0)
            probs = m["xgb"].predict_proba(a)[:, 1]
        else:
            probs = m.predict_proba(X)[:, 1]

        preds = (probs >= 0.5).astype(int)
        risk = np.where(probs >= 0.7, "High", np.where(probs >= 0.3, "Medium", "Low"))
        out = df_raw.copy()
        out["ckd_probability"] = np.round(probs, 4)
        out["ckd_probability_percent"] = np.round(probs * 100, 2)
        out["prediction"] = np.where(preds == 1, "CKD", "Non-CKD")
        out["risk_level"] = risk
        out["model_used"] = model_name
        return out

    def _predict_one(self, model_name: str, X_trans: np.ndarray) -> float:
        m = self.models[model_name]
        if model_name == "DNN + XGBoost Hybrid":
            dnn = m["dnn"]
            a = X_trans
            for W, b in zip(dnn.coefs_[:-1], dnn.intercepts_[:-1]):
                a = np.maximum(a @ W + b, 0)
            return float(m["xgb"].predict_proba(a)[0, 1])
        return float(m.predict_proba(X_trans)[0, 1])

    def predict(self, payload: dict[str, Any], model_name: str | None = None) -> dict[str, Any]:
        model_name = model_name or self.best_name
        if model_name not in self.models:
            raise ValueError(f"Unknown model: {model_name}")

        # Build a single-row DataFrame with the schema expected by the preprocessor
        row = {}
        for f in self.num_features:
            v = payload.get(f)
            row[f] = float(v) if v not in (None, "") else np.nan
        for f in self.cat_features:
            v = payload.get(f)
            row[f] = str(v).strip().lower() if v not in (None, "") else np.nan
        df = pd.DataFrame([row])

        X = self.preprocessor.transform(df)
        prob = self._predict_one(model_name, X)
        prob_pct = round(prob * 100, 2)

        if prob >= 0.7:
            risk = "High"
        elif prob >= 0.3:
            risk = "Medium"
        else:
            risk = "Low"

        # Contribution explanation using Random Forest global feature importance
        # combined with the input's z-scored deviation for numerical features.
        top_contribs = self._contributions(df, X)

        return {
            "model_used": model_name,
            "prediction": "CKD" if prob >= 0.5 else "Non-CKD",
            "probability": prob,
            "probability_percent": prob_pct,
            "risk_level": risk,
            "contributions": top_contribs,
            "threshold": 0.5,
        }

    def _contributions(self, df_raw: pd.DataFrame, X_trans: np.ndarray) -> list[dict[str, Any]]:
        rf = self.models["Random Forest"]
        importances = rf.feature_importances_
        # Signed direction from LR coefficients (fallback)
        lr = self.models["Logistic Regression"]
        coefs = lr.coef_.ravel()
        vals = X_trans[0]
        contribs = []
        for name, val, imp, coef in zip(self.feature_names, vals, importances, coefs):
            score = imp * abs(val)
            direction = "↑ risk" if (val * coef) > 0 else "↓ risk"
            contribs.append({
                "feature": name.replace("num__", "").replace("cat__", ""),
                "value": float(val),
                "importance": float(imp),
                "score": float(score),
                "direction": direction,
            })
        contribs.sort(key=lambda c: c["score"], reverse=True)
        return contribs[:8]


_predictor: CKDPredictor | None = None


def get_predictor() -> CKDPredictor:
    global _predictor
    if _predictor is None:
        _predictor = CKDPredictor()
    return _predictor
