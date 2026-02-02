'use strict';

const { RATE_LIMIT_WINDOW_MS } = require('./config');

const rateLimitBuckets = new Map();

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return { allowed: bucket.count <= max, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt };
}

function enforceRateLimit(req, res, max) {
  const key = `${req.ip || 'unknown'}:${req.path}`;
  const bucket = rateLimit(key, max, RATE_LIMIT_WINDOW_MS);
  res.set('X-RateLimit-Limit', String(max));
  res.set('X-RateLimit-Remaining', String(bucket.remaining));
  res.set('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));
  if (!bucket.allowed) {
    res.status(429).json({ error: 'rate_limited' });
    return false;
  }
  return true;
}

module.exports = { enforceRateLimit };
