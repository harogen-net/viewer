import { Layer, LayerType } from "../Layer";

declare var $: any;
declare var Matrix4: any;

export class Image extends Layer {

	private _imageId:string = "";
	private _clipRect:number[] = [0,0,0,0];
	
	constructor(private imgObj:any, transform:any = null, id:number = -1){
		super(transform, id);
		this._type = LayerType.IMAGE;

		//console.log(imgObj, this._id, this._type);

		//

		this.setOriginalSize(imgObj);

		this.obj.append(imgObj);

		this._imageId = imgObj.data("imageId");
		if(imgObj.data("name") != undefined){
			this._name = imgObj.data("name");
		}
		this.opacityObj = imgObj;
	}

	public swap(imgObj:any) {
		console.log("swap at image id:" + this._id);

		this.imgObj.remove();
		this.obj.append(imgObj);
		this.imgObj = imgObj;
		this._imageId = imgObj.data("imageId");
		if(imgObj.data("name") != undefined){
			this._name = imgObj.data("name");
		}
		this.setOriginalSize(imgObj);

		//NOTE : opacityのみimgObjへの指定なので再設定
		this.opacityObj = imgObj;
		this.opacity = this.opacity;
	}

	//
	
	//
	// override
	//
	//public get opacity(){return this._opacity;}
	/*public set opacity(value){
		if(isNaN(value)) value = 1;
		if(value > 1) value = 1;
		if(value < 0) value = 0;
		this._opacity = value;
		if(this._opacity == 1){
			this.imgObj.css("opacity","");
		}else{
			this.imgObj.css("opacity",this._opacity);
		}
	}*/
	protected makeData():any {
		var ret = super.makeData();
		ret.imageId = this.imageId;
		ret.src = this.imgObj.attr("src");

		if(this._clipRect.some((value)=>{
			return value !== 0;
		})) ret.clipRect = this._clipRect;

		return ret;
	}

/*	public get data():any{
		var ret:any = {
			class:this,
			id:this._id,
			imageId:,
			src:this.imgObj.attr("src"),
			name:this._name,
			transX:this._transX,
			transY:this._transY,
			scaleX:this._scaleX,
			scaleY:this._scaleY,
			rotation:this._rotation,
			mirrorH:this._mirrorH,
			mirrorV:this._mirrorV,
			opacity:this._opacity,
			visible:this._visible,
		};
		if(this._locked) ret.locked = this._locked;
		if(this._shared) ret.shared = this._shared;
		return ret;
	}*/
	public clone(id:number = -1):Image {
		var retImgObj:any = this.imgObj.clone();
		retImgObj.data("imageId", this.imageId);
		retImgObj.data("name", this.name);

		var retImg:Image = new Image(retImgObj, this.transform, id);
		retImg.visible = this._visible;
		retImg.locked = this._locked;
		retImg.opacity = this._opacity;
		retImg.shared = this._shared;
		retImg.clipRect = this._clipRect;
		return retImg;
	}



	public get imageId():string {
		return this._imageId;
		//return this.imgObj.data("imageId");
	}

	public get imageElement():HTMLImageElement {
		return this.imgObj[0] as HTMLImageElement;
	}



	//
	

	//
	
	private setOriginalSize(imgObj:any):void{
		var minSize:number = 50;
		this._originWidth = imgObj.width();
		this._originHeight = imgObj.height();
		this._scaleX_min = minSize / this._originWidth;
		this._scaleY_min = minSize / this._originHeight;
		if(this._originWidth == 0 || this._originHeight == 0){
			//throw new Error();
			imgObj.ready(()=>{
				this._originWidth = imgObj.width();
				this._originHeight = imgObj.height();
				this._scaleX_min = minSize / this._originWidth;
				this._scaleY_min = minSize / this._originHeight;
			});
		}
	}
	
/*	public get center(){
		//var tmpMat = matrix.translate(-this.obj.width() / 2, -this.obj.height() / 2, 0);
//		var tmpMat = matrix.translate(100, 44, 0);
		
		return {x:matrix.values[12] + this.width / 2, y:matrix.values[13] + this.height / 2};
	}*/
	
	public set clipRect(value:number[]){
		this._clipRect = value.slice(0,4);
		this.updateClipRect();
	}
	public get clipRect():number[]{
		return this._clipRect;
	}
	public set clipT(value:number){
		this._clipRect[0] = value;
		this.updateClipRect();
	}
	public get clipT():number {
		return this._clipRect[0];
	}
	public set clipR(value:number){
		this._clipRect[1] = value;
		this.updateClipRect();
	}
	public get clipR():number {
		return this._clipRect[1];
	}
	public set clipB(value:number){
		this._clipRect[2] = value;
		this.updateClipRect();
	}
	public get clipB():number {
		return this._clipRect[2];
	}
	public set clipL(value:number){
		this._clipRect[3] = value;
		this.updateClipRect();
	}
	public get clipL():number {
		return this._clipRect[3];
	}
	private updateClipRect(){
		this.imgObj.css("clip-path","inset(" + this._clipRect[0] + "px " + this._clipRect[1] + "px " + this._clipRect[2] + "px " + this._clipRect[3] + "px)");
	}

	public get originWidth(){
		return this._originWidth - (this._clipRect[1] + this._clipRect[3]);
	}
	public get originHeight(){
		return this._originHeight - (this._clipRect[0] + this._clipRect[2]);
	}

	
}
