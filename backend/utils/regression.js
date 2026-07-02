/**
 * Simple Multiple Linear Regression for STI Weight Optimization.
 * Uses Ordinary Least Squares (OLS) via Normal Equation:
 *   β = (XᵀX)⁻¹ Xᵀy
 * No external ML libraries needed.
 */

const Survey = require('../models/Survey');

/**
 * Transpose a matrix (2D array).
 */
function transpose(M) {
  const rows = M.length, cols = M[0].length;
  const T = Array.from({ length: cols }, () => new Array(rows));
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = M[i][j];
    }
  }
  return T;
}

/**
 * Multiply two matrices A (m×n) and B (n×p).
 */
function matMul(A, B) {
  const m = A.length, n = B[0].length, k = B.length;
  const C = Array.from({ length: m }, () => new Array(n).fill(0));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      for (let l = 0; l < k; l++) {
        C[i][j] += A[i][l] * B[l][j];
      }
    }
  }
  return C;
}

/**
 * Invert a square matrix using Gauss-Jordan elimination.
 * Returns null if singular.
 */
function invertMatrix(M) {
  const n = M.length;
  const aug = M.map((row, i) => {
    const ext = new Array(2 * n).fill(0);
    for (let j = 0; j < n; j++) ext[j] = row[j];
    ext[n + i] = 1;
    return ext;
  });

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) return null;

    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  return aug.map(row => row.slice(n));
}

/**
 * Compute regression coefficients from survey data.
 * Features: lighting, crowdDensity, publicTransport, (10 - incidentFrequency)
 * Target: overallRating
 *
 * Returns: { weights: {lighting, crowd, transport, incident}, intercept, r2, sampleSize }
 */
async function computeOptimalWeights() {
  const surveys = await Survey.find({}).lean();

  if (surveys.length < 10) {
    return {
      weights: { lighting: 0.30, crowd: 0.30, transport: 0.20, incident: 0.20 },
      intercept: 0,
      r2: null,
      sampleSize: surveys.length,
      fallback: true,
      message: 'Not enough survey data (need ≥10). Using default weights.',
    };
  }

  const X = [];
  const y = [];

  for (const s of surveys) {
    X.push([s.lighting, s.crowdDensity, s.publicTransport, 10 - s.incidentFrequency]);
    y.push([s.overallRating]);
  }

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtX_inv = invertMatrix(XtX);

  if (!XtX_inv) {
    return {
      weights: { lighting: 0.30, crowd: 0.30, transport: 0.20, incident: 0.20 },
      intercept: 0,
      r2: null,
      sampleSize: surveys.length,
      fallback: true,
      message: 'Matrix is singular — features are collinear. Using default weights.',
    };
  }

  const Xty = matMul(Xt, y);
  const beta = matMul(XtX_inv, Xty);
  const rawWeights = beta.map(b => b[0]);

  // Normalise to sum to 1 (absolute values, then re-apply sign)
  const absSum = rawWeights.reduce((s, w) => s + Math.abs(w), 0);
  const normWeights = absSum > 0
    ? rawWeights.map(w => Math.round((Math.abs(w) / absSum) * 100) / 100)
    : [0.25, 0.25, 0.25, 0.25];

  // Ensure they sum to exactly 1
  const diff = 1 - normWeights.reduce((s, w) => s + w, 0);
  normWeights[0] = Math.round((normWeights[0] + diff) * 100) / 100;

  // Compute R²
  const yMean = y.reduce((s, v) => s + v[0], 0) / y.length;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < y.length; i++) {
    const predicted = X[i].reduce((s, xi, j) => s + xi * rawWeights[j], 0);
    ssRes += (y[i][0] - predicted) ** 2;
    ssTot += (y[i][0] - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? Math.round((1 - ssRes / ssTot) * 1000) / 1000 : 0;

  return {
    weights: {
      lighting: normWeights[0],
      crowd: normWeights[1],
      transport: normWeights[2],
      incident: normWeights[3],
    },
    intercept: 0,
    r2,
    sampleSize: surveys.length,
    fallback: false,
    message: 'Weights computed from survey data via OLS regression.',
  };
}

/**
 * Generate an STI formula string using computed weights.
 */
async function generateSTIFormula() {
  const result = await computeOptimalWeights();
  const { weights } = result;

  const formula = `STI = ${weights.lighting}×Lighting + ${weights.crowd}×Crowd + ${weights.transport}×Transport + ${weights.incident}×(10 − Incidents)`;

  return {
    ...result,
    formula,
  };
}

module.exports = { computeOptimalWeights, generateSTIFormula };
