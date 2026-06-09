import $ from "jquery";
import { FeatureGate } from "./featureGate";

export function applyFeatureGate(gate: FeatureGate): void {
  if (gate.canEdit) return;

  document.body.classList.add("runtime-readonly");

  // Hide edit-heavy tool areas and keep slideshow/list viewing focused.
  $("#pref, #images").hide();

  // Prevent destructive and export operations in mobile-pwa readonly mode.
  $(".save, .new, .export, .zip, .dispose").prop("disabled", true);

  // Disable import button trigger in readonly mode, but keep load/select usage.
  $("button.import").prop("disabled", true);
}
