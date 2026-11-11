'use strict';
// The response headers every page and file carries (vercel.json, the "/(.*)" rule), shared by scripts/verify-seo.cjs
// (which reads vercel.json) and scripts/verify-seo-live.cjs (which reads the deployed answers). November 11, 2026
// (architecture review P1-2): X-Content-Type-Options and a Permissions-Policy joined the Referrer-Policy. No frame
// protection and no Content-Security-Policy (owner decisions); HSTS is Vercel's own.

/** Each feature the Permissions-Policy turns off, with the source the site would need to use it: none may appear. */
const DISABLED_FEATURES = {
  accelerometer: /\bAccelerometer\b|devicemotion|DeviceMotionEvent/,
  camera: /getUserMedia|ImageCapture/,
  geolocation: /navigator\.geolocation/,
  gyroscope: /\bGyroscope\b|deviceorientation|DeviceOrientationEvent/,
  magnetometer: /\bMagnetometer\b/,
  microphone: /getUserMedia|SpeechRecognition/,
  payment: /PaymentRequest/,
  usb: /navigator\.usb/,
  'browsing-topics': /browsingTopics/,
};
/** Features the site uses (copy a link, share a report card), which keep their default (self): never turned off. */
const USED_FEATURES = ['clipboard-write', 'web-share'];

const SITE_HEADERS = {
  'referrer-policy': 'strict-origin',
  'x-content-type-options': 'nosniff',
  'permissions-policy': Object.keys(DISABLED_FEATURES).map((feature) => `${feature}=()`).join(', '),
};

module.exports = { DISABLED_FEATURES, USED_FEATURES, SITE_HEADERS };
