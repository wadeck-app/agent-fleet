/**
 * Largest WebSocket frame, in bytes, the daemon's worker listener accepts.
 *
 * One constant for both ends: the daemon passes it as the ws `maxPayload` (a bigger frame closes
 * the socket with code 1009 and no explanation), and the worker refuses to send anything bigger
 * so the step fails with a readable reason instead.
 */
export const MAX_WORKER_FRAME_BYTES = 1024 * 1024;
