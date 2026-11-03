import { FEATURES, type FeatureName, type FeatureVector } from "./features";

export type ModelParams = {
  kind: "logistic" | "rules";
  features: FeatureName[];
  weights: number[]; // per standardised feature
  bias: number;
  means: number[];
  stds: number[];
  trainedOn?: { from: string; to: string; n: number; positives: number };
};

export type CalibrationBand = { band: string; n: number; predicted: number; actual: number };

export type ModelMetrics = {
  auc: number | null;
  brier: number | null;
  n: number;
  baseRate: number | null;
  holdout?: { from: string; to: string };
  calibration: CalibrationBand[];
};

export type Example = { x: FeatureVector; y: 0 | 1 };

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/**
 * Hand-set starting weights, used until enough history exists to train a model.
 * Signs follow collections practice: older, unpaid, broken-promise, unreachable loans roll.
 */
export const RULES_V0: ModelParams = {
  kind: "rules",
  features: [...FEATURES],
  weights: [0.2, -0.6, 0.5, 0.45, 0.6, -0.35, 0.45, 0.3, -0.5, 0.15, -0.2],
  bias: -1.2,
  means: [15, 15, 45, 1.5, 0.3, 0.3, 0.4, 0.05, 0.2, 1.0, 24],
  stds: [9, 9, 40, 1.5, 0.6, 0.6, 0.8, 0.2, 0.4, 0.6, 15],
};

export function standardise(params: ModelParams, x: FeatureVector): number[] {
  return params.features.map((f, i) => (x[f] - params.means[i]) / (params.stds[i] || 1));
}

export function predict(params: ModelParams, x: FeatureVector): { p: number; z: number[]; contributions: number[] } {
  const z = standardise(params, x);
  const contributions = z.map((v, i) => v * params.weights[i]);
  const logit = params.bias + contributions.reduce((a, b) => a + b, 0);
  return { p: sigmoid(logit), z, contributions };
}

/**
 * L2-regularised logistic regression fitted with batch gradient descent.
 * Small, dependency-free and fully explainable: each weight is the change in log-odds
 * for one standard deviation of that input, which is what the per-loan reasons are built from.
 */
export function train(examples: Example[], opts: { iterations?: number; learningRate?: number; l2?: number } = {}): ModelParams {
  const iterations = opts.iterations ?? 600;
  const lr = opts.learningRate ?? 0.3;
  const l2 = opts.l2 ?? 0.01;
  const features = [...FEATURES];
  const n = examples.length;
  if (n < 50) throw new Error("not_enough_history");

  const means = features.map((f) => examples.reduce((s, e) => s + e.x[f], 0) / n);
  const stds = features.map((f, i) => {
    const v = examples.reduce((s, e) => s + (e.x[f] - means[i]) ** 2, 0) / n;
    return Math.sqrt(v) || 1;
  });
  const X = examples.map((e) => features.map((f, i) => (e.x[f] - means[i]) / stds[i]));
  const Y = examples.map((e) => e.y);

  const w = new Array(features.length).fill(0);
  const pos = Y.reduce<number>((a, b) => a + b, 0);
  let b = Math.log((pos + 1) / (n - pos + 1));

  for (let it = 0; it < iterations; it++) {
    const gw = new Array(features.length).fill(0);
    let gb = 0;
    for (let r = 0; r < n; r++) {
      let z = b;
      for (let j = 0; j < w.length; j++) z += w[j] * X[r][j];
      const err = sigmoid(z) - Y[r];
      gb += err;
      for (let j = 0; j < w.length; j++) gw[j] += err * X[r][j];
    }
    b -= (lr * gb) / n;
    for (let j = 0; j < w.length; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
  }

  return { kind: "logistic", features, weights: w, bias: b, means, stds };
}

/** Area under the ROC curve via the rank-sum formula, with ties averaged. */
export function auc(scores: number[], labels: (0 | 1)[]): number | null {
  const idx = scores.map((s, i) => [s, labels[i]] as const).sort((a, b) => a[0] - b[0]);
  const pos = labels.filter((l) => l === 1).length;
  const neg = labels.length - pos;
  if (!pos || !neg) return null;
  let rankSum = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) if (idx[k][1] === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export function evaluate(preds: number[], labels: (0 | 1)[], holdout?: { from: string; to: string }): ModelMetrics {
  const n = preds.length;
  if (!n) return { auc: null, brier: null, n: 0, baseRate: null, calibration: [], holdout };
  const brier = preds.reduce((s, p, i) => s + (p - labels[i]) ** 2, 0) / n;
  const bands: [number, number, string][] = [
    [0, 0.1, "0–10%"],
    [0.1, 0.2, "10–20%"],
    [0.2, 0.35, "20–35%"],
    [0.35, 0.5, "35–50%"],
    [0.5, 1.01, "50%+"],
  ];
  const calibration = bands
    .map(([lo, hi, band]) => {
      const ix = preds.map((p, i) => [p, i] as const).filter(([p]) => p >= lo && p < hi).map(([, i]) => i);
      if (!ix.length) return { band, n: 0, predicted: 0, actual: 0 };
      return {
        band,
        n: ix.length,
        predicted: ix.reduce((s, i) => s + preds[i], 0) / ix.length,
        actual: ix.reduce((s, i) => s + labels[i], 0) / ix.length,
      };
    })
    .filter((b) => b.n > 0);
  return { auc: auc(preds, labels), brier, n, baseRate: labels.reduce<number>((a, b) => a + b, 0) / n, calibration, holdout };
}
