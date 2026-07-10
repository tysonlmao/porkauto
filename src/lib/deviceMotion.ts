export type MotionPermission = "granted" | "denied" | "prompt" | "unsupported";

export type OrientationSample = {
  /** Degrees clockwise from north (0–360). */
  heading: number;
  absolute: boolean;
};

export type AccelerationSample = {
  /** Device-frame m/s². */
  x: number;
  y: number;
  z: number;
  includesGravity: boolean;
  timestamp: number;
};

type PermissionedOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type PermissionedMotion = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

/** iOS Safari requires these APIs to be invoked from a user gesture. */
export function motionPermissionRequiresUserGesture(): boolean {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const orientation = DeviceOrientationEvent as PermissionedOrientation;
  const motion =
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as PermissionedMotion)
      : null;
  return (
    typeof orientation.requestPermission === "function" ||
    typeof motion?.requestPermission === "function"
  );
}

/**
 * Request orientation + motion access.
 * On iOS Safari this MUST run inside a click/tap handler.
 */
export async function requestMotionPermissions(): Promise<MotionPermission> {
  if (
    typeof DeviceOrientationEvent === "undefined" &&
    typeof DeviceMotionEvent === "undefined"
  ) {
    return "unsupported";
  }

  const orientation = DeviceOrientationEvent as PermissionedOrientation;
  const motion =
    typeof DeviceMotionEvent !== "undefined"
      ? (DeviceMotionEvent as PermissionedMotion)
      : null;

  try {
    if (typeof orientation.requestPermission === "function") {
      const result = await orientation.requestPermission();
      if (result !== "granted") return "denied";
    }
    if (motion && typeof motion.requestPermission === "function") {
      const result = await motion.requestPermission();
      if (result !== "granted") return "denied";
    }
    return "granted";
  } catch (err) {
    console.warn("Motion permission request failed", err);
    return "denied";
  }
}

/** Normalize compass heading to 0–360. */
export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Compass heading from DeviceOrientation.
 * Prefers webkitCompassHeading on iOS.
 */
export function headingFromOrientation(
  event: DeviceOrientationEvent,
): OrientationSample | null {
  const webkitHeading = (
    event as DeviceOrientationEvent & { webkitCompassHeading?: number }
  ).webkitCompassHeading;

  if (typeof webkitHeading === "number" && Number.isFinite(webkitHeading)) {
    return { heading: normalizeHeading(webkitHeading), absolute: true };
  }

  if (typeof event.alpha !== "number" || !Number.isFinite(event.alpha)) {
    return null;
  }

  const absolute = Boolean(
    (event as DeviceOrientationEvent & { absolute?: boolean }).absolute,
  );
  // alpha is degrees from north when absolute; otherwise relative.
  const heading = absolute
    ? normalizeHeading(360 - event.alpha)
    : normalizeHeading(360 - event.alpha);

  return { heading, absolute };
}

export function accelerationFromMotion(
  event: DeviceMotionEvent,
): AccelerationSample | null {
  if (event.acceleration?.x != null && event.acceleration.y != null) {
    return {
      x: event.acceleration.x,
      y: event.acceleration.y,
      z: event.acceleration.z ?? 0,
      includesGravity: false,
      timestamp: event.timeStamp || performance.now(),
    };
  }

  const g = event.accelerationIncludingGravity;
  if (g?.x == null || g.y == null || g.z == null) return null;

  return {
    x: g.x,
    y: g.y,
    z: g.z,
    includesGravity: true,
    timestamp: event.timeStamp || performance.now(),
  };
}

/**
 * Horizontal forward acceleration (m/s²) in the device plane.
 * Removes gravity when needed, then takes the dominant horizontal axis
 * (works for iPad portrait + landscape mounts).
 */
export function forwardAcceleration(sample: AccelerationSample): number {
  let x = sample.x;
  let y = sample.y;
  let z = sample.z;

  if (sample.includesGravity) {
    const mag = Math.hypot(x, y, z) || 1;
    // Unit gravity direction, then linear accel ≈ total − ĝ·|g|
    const g = 9.81;
    const gx = (x / mag) * g;
    const gy = (y / mag) * g;
    const gz = (z / mag) * g;
    x -= gx;
    y -= gy;
    z -= gz;
  }

  // Horizontal components dominate for vehicle motion on a flat mount.
  if (Math.abs(y) >= Math.abs(x)) {
    return y;
  }
  return x;
}

/**
 * Dead-reckoning speed from forward acceleration.
 * GPS sync keeps it honest; ZUPT zeros when nearly still.
 */
export class ImuSpeedEstimator {
  private velocityMps = 0;
  private lastTs: number | null = null;
  private stillMs = 0;
  private filteredForward = 0;

  reset(speedMps = 0) {
    this.velocityMps = speedMps;
    this.lastTs = null;
    this.stillMs = 0;
    this.filteredForward = 0;
  }

  syncFromGps(speedMps: number) {
    if (speedMps >= 0 && Number.isFinite(speedMps)) {
      // Blend toward GPS so IMU doesn't fight a good fix.
      this.velocityMps = this.velocityMps * 0.25 + speedMps * 0.75;
    }
  }

  update(forwardMps2: number, timestampMs: number): number {
    const dt =
      this.lastTs == null
        ? 0
        : Math.min(0.2, Math.max(0, (timestampMs - this.lastTs) / 1000));
    this.lastTs = timestampMs;

    this.filteredForward = this.filteredForward * 0.75 + forwardMps2 * 0.25;

    const absAcc = Math.abs(this.filteredForward);
    if (absAcc < 0.28) {
      this.stillMs += dt * 1000;
    } else {
      this.stillMs = 0;
    }

    if (this.stillMs > 450) {
      this.velocityMps *= 0.78;
      if (this.velocityMps < 0.35) this.velocityMps = 0;
    } else if (dt > 0) {
      this.velocityMps = Math.max(
        0,
        this.velocityMps + this.filteredForward * dt,
      );
      // Light drag so error doesn't run away
      this.velocityMps *= 1 - Math.min(0.06, dt * 0.12);
    }

    return Math.min(220, Math.max(0, this.velocityMps * 3.6));
  }
}
