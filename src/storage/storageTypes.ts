export const HVDataType = {
	PNG: "PNG",
	HVD: "HVD",
	HVZ: "HVZ",
} as const;

export type HVDataType = (typeof HVDataType)[keyof typeof HVDataType];

export interface SlideTitle {
	id: number;
	title: string;
	update: number;
}
