import { AppRuntimeMode } from "./mode";

export type FeatureGate = {
  canEdit: boolean;
  canSave: boolean;
  canExport: boolean;
};

export function getFeatureGate(mode: AppRuntimeMode): FeatureGate {
  if (mode === "mobile-pwa") {
    return {
      canEdit: false,
      canSave: false,
      canExport: false,
    };
  }

  return {
    canEdit: true,
    canSave: true,
    canExport: true,
  };
}
