export enum PropFlags {
	X				= 1 << 1,
	Y				= 1 << 2,
	SCALE_X			= 1 << 3,
	SCALE_Y			= 1 << 4,
	ROTATION		= 1 << 5,
	MIRROR_H		= 1 << 6,
	MIRROR_V		= 1 << 7,

	NAME			= 1 << 8,
	LOCKED			= 1 << 9,
	VISIBLE			= 1 << 10,
	OPACITY			= 1 << 11,
	SHARED			= 1 << 12,

	IMG_IMAGEID		= 1 << 14,
	IMG_CLIP		= 1 << 15,

	TXT_TEXT		= 1 << 16,

	L_SELECT		= 1 << 17,



	ALL				= (2**18-1)

}