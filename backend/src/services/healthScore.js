"use strict";
/**
 * Calculates a 0-100 health score from per-bucket check data.
 *
 * Three independent signals:
 * - Latency (p95 of ALL checks): capped at 35 point penalty
 * - Degradation (% of UP checks with errors): capped at 35 point penalty
 * - Down (% of checks that are DOWN): capped at 30 point penalty
 *
 * Floor guarantee: if no down and no degraded checks, score never
 * drops below 50 (latency alone cannot crash a healthy service).
 *
 * @param bucket - Raw aggregated bucket data
 * @returns Score result with breakdown for transparency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateHealthScore = calculateHealthScore;
function calculateHealthScore(bucket) {
    // p95 latency from all checks in bucket
    const sortedLat = [...bucket.latencies].sort((a, b) => a - b);
    const p95 = sortedLat.length > 0
        ? sortedLat[Math.floor(sortedLat.length * 0.95)]
        : 0;
    const avgLatency = bucket.latencies.length > 0
        ? Math.round(bucket.latencies.reduce((a, c) => a + c, 0) / bucket.latencies.length)
        : 0;
    // Penalties (each capped independently)
    const latencyPenalty = Math.min(p95 / 100, 35); // p95 > 3500 ms = max 35 off
    const totalUp = bucket.totalChecks - bucket.downChecks;
    const degradedRate = totalUp > 0 ? (bucket.degradedChecks / totalUp) * 100 : 0;
    const degradedPenalty = Math.min(degradedRate * 0.4, 35); // 100% degraded = max 35 off
    const downRate = bucket.totalChecks > 0
        ? (bucket.downChecks / bucket.totalChecks) * 100
        : 0;
    const downPenalty = Math.min(downRate * 0.3, 30); // 100% down = max 30 off
    // Score with floor guarantee
    const raw = 100 - latencyPenalty - degradedPenalty - downPenalty;
    // Floor of 50 only when there are no down and no degraded checks —
    // latency alone cannot crash a healthy service.
    const floor = bucket.downChecks === 0 && bucket.degradedChecks === 0 ? 50 : 0;
    const score = Math.max(raw, floor);
    return {
        score: Math.round(score),
        latencyPenalty: Math.round(latencyPenalty),
        degradedPenalty: Math.round(degradedPenalty),
        downPenalty: Math.round(downPenalty),
        p95Latency: p95,
        avgLatency,
    };
}
