// Derives a combination weight for two correlated scores (presence_gap_score,
// fit_score) from their actual spread across the dataset, instead of an
// asserted split like 0.6/0.4. This is the first principal component of the
// 2x2 covariance matrix — closed-form for two dimensions, no library needed.
export function pca2(pairs: [number, number][]): {
  weights: [number, number];
  explainedVarianceRatio: number;
} {
  const n = pairs.length;
  const mean0 = pairs.reduce((s, p) => s + p[0], 0) / n;
  const mean1 = pairs.reduce((s, p) => s + p[1], 0) / n;

  let cov00 = 0;
  let cov01 = 0;
  let cov11 = 0;
  for (const [a, b] of pairs) {
    const da = a - mean0;
    const db = b - mean1;
    cov00 += da * da;
    cov01 += da * db;
    cov11 += db * db;
  }
  cov00 /= n - 1;
  cov01 /= n - 1;
  cov11 /= n - 1;

  const trace = cov00 + cov11;
  const det = cov00 * cov11 - cov01 * cov01;
  const disc = Math.sqrt(Math.max(trace * trace / 4 - det, 0));
  const lambda1 = trace / 2 + disc;
  const lambda2 = trace / 2 - disc;

  let w0: number;
  let w1: number;
  if (Math.abs(cov01) > 1e-9) {
    w0 = lambda1 - cov11;
    w1 = cov01;
  } else {
    // Diagonal covariance — eigenvector aligned with the higher-variance axis.
    w0 = cov00 >= cov11 ? 1 : 0;
    w1 = cov00 >= cov11 ? 0 : 1;
  }

  const norm = Math.sqrt(w0 * w0 + w1 * w1);
  w0 /= norm;
  w1 /= norm;

  // Both inputs are "higher = bigger opportunity" — keep weights non-negative
  // so the combination stays interpretable.
  if (w0 < 0 && w1 < 0) {
    w0 = -w0;
    w1 = -w1;
  }

  const explainedVarianceRatio = lambda1 / (lambda1 + lambda2);
  return { weights: [w0, w1], explainedVarianceRatio };
}
