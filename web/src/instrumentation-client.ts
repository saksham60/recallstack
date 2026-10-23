import { captureFirstTouch } from "./lib/telemetry/acquisition";

// Next runs this synchronously before React hydration and auth initialization.
captureFirstTouch();

export function onRouterTransitionStart(url: string) {
  captureFirstTouch(url);
}
