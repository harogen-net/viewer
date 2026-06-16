export const ViewerMode = {
	SELECT: 0,
	EDIT: 1,
	SLIDESHOW: 2,
} as const;

export type ViewerMode = (typeof ViewerMode)[keyof typeof ViewerMode];

export const ViewerStartUpMode = {
	VIEW_AND_EDIT: 0,
	VIEW_ONLY: 1,
} as const;

export type ViewerStartUpMode = (typeof ViewerStartUpMode)[keyof typeof ViewerStartUpMode];
