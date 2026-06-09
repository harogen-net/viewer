import $ from "jquery";
import { FeatureGate } from "./featureGate";

export function applyFeatureGate(gate: FeatureGate): void {
  if (!gate.canEdit) {
    document.body.classList.add("runtime-readonly");

    // Hide edit-heavy tool areas and keep slideshow/list viewing focused.
    $("#pref, #images").hide();

    // Prevent destructive operations in readonly mode.
    $(".save, .new, .export, .zip").prop("disabled", true);
  }

  if (!gate.canDeleteSavedData) {
    $(".dispose").prop("disabled", true);
  }

  if (!gate.canImport) {
    $("button.import").prop("disabled", true);
  }
}
