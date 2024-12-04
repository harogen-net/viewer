export const DataType = {
  PNG: "PNG",
  HVD: "HVD",
  HVZ: "HVZ",
} as const;
export type DataType = (typeof DataType)[keyof typeof DataType];
export const DataTypes = Object.values(DataType);