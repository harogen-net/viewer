import { LayerType } from "../layerModel/Layer";


export interface ILayer {
	type:LayerType;

	x:number;
	y:number;
	width:number;
	height:number;

	transX:number;
	transY:number;
	scaleX:number;
	scaleY:number;
	rotation:number;
	mirrorH:boolean;
	mirrorV:boolean;

	locked:boolean;
	visible:boolean;
	opacity:number;
	shared:boolean;
}

export interface IImage extends ILayer {
	imageId:string;
	
	clipT:number;
	clipB:number;
	clipL:number;
	clipR:number;
	clipRect:number[];
}