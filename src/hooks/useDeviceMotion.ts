import { useEffect, useRef } from "react";
import {
  ImuSpeedEstimator,
  accelerationFromMotion,
  forwardAcceleration,
  headingFromOrientation,
  motionPermissionRequiresUserGesture,
} from "@/lib/deviceMotion";
import { useVehicleStore } from "@/store/vehicle";

type MotionHandlers = {
  orientation: (e: DeviceOrientationEvent) => void;
  motion: (e: DeviceMotionEvent) => void;
};

/**
 * Device orientation (map heading) + accelerometer (speed UI) when OBD is off.
 * iOS: listeners attach after promptDeviceAccessFromUserGesture grants permission.
 */
export function useDeviceMotion(enabled: boolean) {
  const estimatorRef = useRef(new ImuSpeedEstimator());
  const lastGpsSpeedAt = useRef(0);
  const lastGpsSpeedKmh = useRef<number | null>(null);
  const handlersRef = useRef<MotionHandlers | null>(null);
  const listeningRef = useRef(false);
  const lastHeadingPublish = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const unsubGps = useVehicleStore.subscribe((state, prev) => {
      // Only treat real GPS speed samples as authoritative — position-only
      // updates must not suppress accelerometer speed.
      if (
        state.speedSource === "gps" &&
        state.speedKmh !== prev.speedKmh &&
        Number.isFinite(state.speedKmh)
      ) {
        lastGpsSpeedAt.current = performance.now();
        lastGpsSpeedKmh.current = state.speedKmh;
        estimatorRef.current.syncFromGps(state.speedKmh / 3.6);
      }
      if (state.obdConnected && !prev.obdConnected) {
        estimatorRef.current.reset(state.speedKmh / 3.6);
      }
    });

    function attachListeners() {
      if (listeningRef.current) return;

      const orientation = (event: DeviceOrientationEvent) => {
        const state = useVehicleStore.getState();
        if (state.obdConnected) return;
        const sample = headingFromOrientation(event);
        if (!sample) return;

        // Throttle store writes a bit; map still feels live.
        const now = performance.now();
        if (now - lastHeadingPublish.current < 32) return;
        lastHeadingPublish.current = now;

        state.setHeadingFromSensor(sample.heading, "imu");
      };

      const motion = (event: DeviceMotionEvent) => {
        const state = useVehicleStore.getState();
        if (state.obdConnected) return;
        const sample = accelerationFromMotion(event);
        if (!sample) return;

        const forward = forwardAcceleration(sample);
        const imuKmh = estimatorRef.current.update(forward, sample.timestamp);

        const gpsAge = performance.now() - lastGpsSpeedAt.current;
        const gpsSpeed = lastGpsSpeedKmh.current;
        const gpsSpeedFresh =
          gpsAge < 2_000 && gpsSpeed != null && Number.isFinite(gpsSpeed);

        // Prefer GPS speed when it is fresh; otherwise accelerometer estimate.
        if (gpsSpeedFresh && gpsSpeed! >= 1) {
          estimatorRef.current.syncFromGps(gpsSpeed! / 3.6);
          // Still publish GPS so UI stays in sync if source flipped
          if (state.speedSource !== "gps") {
            state.setSpeedFromSensor(gpsSpeed!, "gps");
          }
          return;
        }

        state.setSpeedFromSensor(imuKmh, "imu");
      };

      handlersRef.current = { orientation, motion };
      window.addEventListener("deviceorientation", orientation, true);
      window.addEventListener("deviceorientationabsolute", orientation, true);
      window.addEventListener("devicemotion", motion, true);
      listeningRef.current = true;
      useVehicleStore.getState().setMotionStatus({
        available: true,
        error: null,
      });
      useVehicleStore.setState({ motionNeedsGesture: false });
    }

    function detachListeners() {
      const handlers = handlersRef.current;
      if (!handlers) return;
      window.removeEventListener(
        "deviceorientation",
        handlers.orientation,
        true,
      );
      window.removeEventListener(
        "deviceorientationabsolute",
        handlers.orientation,
        true,
      );
      window.removeEventListener("devicemotion", handlers.motion, true);
      handlersRef.current = null;
      listeningRef.current = false;
    }

    useVehicleStore.setState({
      enableMotionSensors: async () => {
        attachListeners();
        return true;
      },
    });

    if (!motionPermissionRequiresUserGesture()) {
      attachListeners();
    } else {
      useVehicleStore.getState().setMotionStatus({
        available: false,
        error: null,
      });
      useVehicleStore.setState({ motionNeedsGesture: true });
    }

    return () => {
      unsubGps();
      detachListeners();
      useVehicleStore.setState({
        enableMotionSensors: null,
        motionNeedsGesture: false,
      });
    };
  }, [enabled]);
}
