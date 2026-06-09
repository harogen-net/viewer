import { AppRuntimeMode } from "./mode";

export type FeatureGate = {
  canEdit: boolean;
  canSave: boolean;
  canExport: boolean;
  canImport: boolean;
  canDeleteSavedData: boolean;
};

export function getFeatureGate(mode: AppRuntimeMode): FeatureGate {
  if (mode === "mobile-pwa") {
    return {
      canEdit: false,
      canSave: false,
      canExport: false,
      canImport: true,
      canDeleteSavedData: false,
    };
  }

  return {
    canEdit: true,
    canSave: true,
    canExport: true,
    canImport: true,
    canDeleteSavedData: true,
  };
}
