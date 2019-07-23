export enum PropFlags {	//52個まで設定可能？
	//Layer
	X				= 1 << 0,
	Y				= 1 << 1,
	SCALE_X			= 1 << 2,
	SCALE_Y			= 1 << 3,
	ROTATION		= 1 << 4,
	MIRROR_H		= 1 << 5,
	MIRROR_V		= 1 << 6,
	NAME			= 1 << 7,
	LOCKED			= 1 << 8,
	VISIBLE			= 1 << 9,
	OPACITY			= 1 << 10,
	SHARED			= 1 << 11,

	//ImageLayer
	IMG_IMAGEID		= 1 << 12,
	IMG_CLIP		= 1 << 13,

	//TextLayer
	TXT_TEXT		= 1 << 14,

	//LayerView
	LV_SELECT		= 1 << 15,

	//Slide
	S_DURATION		= 1 << 16,
	S_JOIN			= 1 << 17,
	S_DISABLED		= 1 << 18,
	S_LAYER_ADD		= 1 << 19,
	S_LAYER_REMOVE	= 1 << 20,
	S_LAYER_ORDER	= 1 << 21,
	S_LAYER			= 1 << 22,

	//SlideView
	SV_SELECT		= 1 << 23,

	//DOMSlideView
	DSV_SCALE		= 1 << 24,
	//EditableSlideView
	ESV_RECT		= 1 << 25,

	ALL				= (2**26-1)
}
