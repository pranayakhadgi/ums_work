"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferEnvironment = inferEnvironment;
function inferEnvironment(url) {
    const lower = url.toLowerCase();
    if (lower.includes('prod') || lower.includes('production'))
        return 'Prod';
    if (lower.includes('qa') || lower.includes('staging'))
        return 'QA';
    if (lower.includes('dev') || lower.includes('localhost'))
        return 'Dev';
    return 'Dev';
}
