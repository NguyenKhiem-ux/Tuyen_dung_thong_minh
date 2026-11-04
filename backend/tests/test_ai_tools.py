import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "evaluation"))

from feedback_report import summarize  # noqa: E402
from fairness_audit import max_deviation  # noqa: E402
from shadow_compare import spearman  # noqa: E402
from tune_weights import FEATURES, suggest_weights  # noqa: E402


def synthetic(n, true=(0.6, 0.1, 0.2, 0.1), seed=1):
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        scores = rng.uniform(0, 100, 4)
        logit = (np.dot(true, scores) - 50) / 8 + rng.normal(0, 0.5)
        out.append(dict(zip(FEATURES, scores)) | {"label": int(rng.random() < 1 / (1 + np.exp(-logit)))})
    return out


class TuneWeightsTests(unittest.TestCase):
    def test_refuses_with_too_little_data(self):
        result = suggest_weights(synthetic(12))
        self.assertFalse(result["ok"])
        self.assertIn("Cần ít nhất", result["reason"])

    def test_refuses_when_one_class_is_tiny(self):
        samples = synthetic(100)
        for s in samples:
            s["label"] = 1
        samples[0]["label"] = 0
        self.assertFalse(suggest_weights(samples)["ok"])

    def test_recovers_dominant_feature_and_weights_sum_to_one(self):
        result = suggest_weights(synthetic(600), bootstrap=60)
        self.assertTrue(result["ok"])
        self.assertAlmostEqual(sum(result["weights"].values()), 1.0, places=2)
        self.assertEqual(max(result["weights"], key=result["weights"].get), "skill")
        self.assertGreater(result["weights"]["skill"], result["weights"]["experience"])
        self.assertTrue(result["env"].startswith("AI_WEIGHTS="))
        self.assertGreater(result["auc_suggested_cv"], 0.7)

    def test_pure_noise_is_not_reported_as_strong_signal(self):
        rng = np.random.default_rng(3)
        samples = [dict(zip(FEATURES, rng.uniform(0, 100, 4))) | {"label": int(rng.random() < 0.5)} for _ in range(300)]
        result = suggest_weights(samples, bootstrap=60)
        self.assertLess(result["auc_suggested_cv"], 0.6)


class FeedbackReportTests(unittest.TestCase):
    def test_summary(self):
        rows = [("agree", 85)] * 6 + [("too_high", 85)] * 2 + [("too_low", 30)] * 1
        s = summarize(rows)
        self.assertEqual(s["counts"], {"agree": 6, "too_high": 2, "too_low": 1})
        self.assertEqual(s["agreement_rate"], round(6 / 9, 3))
        self.assertEqual(s["drift"], "chấm quá cao")
        self.assertFalse(s["reliable"])
        top = [b for b in s["bins"] if b["range"] == "80-100"][0]
        self.assertEqual((top["n"], top["agree_rate"]), (8, 0.75))
        self.assertIsNone([b for b in s["bins"] if b["range"] == "0-40"][0]["agree_rate"])  # chưa đủ mẫu

    def test_empty(self):
        self.assertEqual(summarize([])["agreement_rate"], None)


class MiscToolTests(unittest.TestCase):
    def test_spearman(self):
        self.assertEqual(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertEqual(spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1.0)
        self.assertIsNone(spearman([1, 2], [1, 2]))
        self.assertIsNone(spearman([1, 1, 1], [1, 2, 3]))

    def test_max_deviation(self):
        base = dict.fromkeys(("skill_score", "experience_score", "semantic_score", "project_score", "final_score"), 50.0)
        self.assertEqual(max_deviation(base, base), 0.0)
        self.assertEqual(max_deviation(base, base | {"semantic_score": 52.5}), 2.5)


if __name__ == "__main__":
    unittest.main()
