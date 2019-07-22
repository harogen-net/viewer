export enum PropFlags {	//52個まで設定可能？
	//Layer
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

	//ImageLayer
	IMG_IMAGEID		= 1 << 14,
	IMG_CLIP		= 1 << 15,

	//TextLayer
	TXT_TEXT		= 1 << 16,

	//LayerView
	LV_SELECT		= 1 << 17,

	//Slide

	//EditableSlideView
	ESV_RECT		= 1 << 18,

	ALL				= (2**19-1)
}
