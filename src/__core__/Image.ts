declare var $: any;
declare var Matrix4: any;

export class Image{

	private _id:number;

	private _originWidth:number;
	private _originHeight:number;
	
	public obj:any;	//<div class="wrapper" />
	
//	private _transform:any = null;

	private _name:string = "";
	
	private _transX:number = 0;
	private _transY:number = 0;
	private _scaleX:number = 1;
	private _scaleY:number = 1;
	private _rotation:number = 0;
	private _mirrorH:boolean = false;
	private _mirrorV:boolean = false;

	private _scaleX_min:number = 1;
	private _scaleY_min:number = 1;
	
	private _selected:boolean = false;

	private _locked:boolean = false;
	private _visible:boolean = true;
	private _opacity:number = 1;
	private _shared:boolean = false;

	private _imageId:string = "";

	
	constructor(private imgObj:any, transform:any = null, id:number = -1){
		if(id == -1){
			this._id = Math.floor(Math.random() * 10000000);
		}else{
			this._id = id;
		}

		this.setOriginalSize(imgObj);

		this.obj = $('<div class="imgWrapper" />');
		this.obj.append(imgObj);

		this._imageId = imgObj.data("imageId");
		if(imgObj.data("name") != undefined){
			this._name = imgObj.data("name");
		}
		
		if(transform){
			this.transform = transform;
		}else{
			this.updateMatrix();
		}
	}

	public swap(imgObj:any) {
		this.setOriginalSize(imgObj);
		this.imgObj.remove();
		this.obj.append(imgObj);
		this.imgObj = imgObj;
		this._imageId = imgObj.data("imageId");
		if(imgObj.data("name") != undefined){
			this._name = imgObj.data("name");
		}
	}

	//
	
	public moveTo(x:number, y:number):void{
		this._transX = x - (this._originWidth / 2);
		this._transY = y - (this._originHeight / 2);

		this.updateMatrix();
	}
	public moveBy(x:number,y:number):void{
		this._transX += x;
		this._transY += y;
		
		this.updateMatrix();
	}
 	public scaleBy(scaleX:number, scaleY:number = NaN):void{
		this._scaleX *= scaleX;
		if(isNaN(scaleY)){
			this._scaleY *= scaleX;
		}else{
			this._scaleY *= scaleY;
		}
		
		this.updateMatrix();
	}
	public rotateBy(theta:number):void{
		this._rotation += theta * 180 / Math.PI;
		
		this.updateMatrix();
	}

	//

	public get name():string{return this._name;}
	public set name(value:string){
		this._name = value;
	}
	
	public get selected():boolean{ return this._selected;}
	public set selected(value:boolean){
		this._selected = value;
	}
	public get locked():boolean{ return this._locked;}
	public set locked(value:boolean){
		this._locked = value;
		if(this._locked){
			this.obj.addClass("locked");
		}else{
			this.obj.removeClass("locked");
		}
	}
	public get visible():boolean{ return this._visible;}
	public set visible(value:boolean){
		this._visible = value;
		if(!this._visible){
			this.obj.addClass("invisible");
		}else{
			this.obj.removeClass("invisible");
		}
	}

	public get mirrorH(){return this._mirrorH;}
	public set mirrorH(value){
		this._mirrorH = value;
		this.updateMatrix();
	}
	public get mirrorV(){return this._mirrorV;}
	public set mirrorV(value){
		this._mirrorV = value;
		this.updateMatrix();
	}
	public get shared(){return this._shared;}
	public set shared(value){
		this._shared = value;
	}
	

 	public get x():number{
		return (this._originWidth / 2) + this._transX;
	}
	public set x(value:number){
		this._transX = value - (this._originWidth / 2);
		this.updateMatrix();
	}
	public get y():number{return (this._originHeight / 2) + this._transY;}
	public set y(value:number){
		this._transY = value  - (this._originHeight / 2);
		this.updateMatrix();
	}
	public get scale(){
		if(this._scaleX == this._scaleY) return this._scaleX;
		return NaN;
	}
	public set scale(value){
		if(isNaN(value)) value = 1;
		this._scaleX = value;
		this._scaleY = value;
		this.updateMatrix();
	}
	public get scaleX(){return this._scaleX;}
	public set scaleX(value){
		if(isNaN(value)) value = 1;
		this._scaleX = (value > this._scaleX_min) ? value : this._scaleX_min;
		this.updateMatrix();
	}
	public get scaleY(){return this._scaleY;}
	public set scaleY(value){
		if(isNaN(value)) value = 1;
		this._scaleY = (value > this._scaleY_min) ? value : this._scaleY_min;
		this.updateMatrix();
	}
	public get rotation(){return this._rotation;}
	public set rotation(value){
		if(isNaN(value)) value = 0;
		this._rotation = ((value + 180) % (360)) - 180;
		this.updateMatrix();
	}
	public get opacity(){return this._opacity;}
	public set opacity(value){
		if(isNaN(value)) value = 1;
		if(value > 1) value = 1;
		if(value < 0) value = 0;
		this._opacity = value;
		if(this._opacity == 1){
			this.imgObj.css("opacity","");
		}else{
			this.imgObj.css("opacity",this._opacity);
		}
	}




	public get width(){
		return this.obj.width()// * this._scaleX;
	}
	public get height(){
		return this.obj.height()// * this._scaleY;
	}

	public get originWidth(){
		return this._originWidth;
	}
	public get originHeight(){
		return this._originHeight;
	}
 	public get diagonalAngle(){
		return Math.atan2(this.height, this.width);
	}
	
	public get transform(){
		if(this._transX == 0 && this._transY == 0 && this._scaleX == 1 && this._scaleY == 1 && this._rotation == 0 && !this._mirrorH && !this._mirrorV) {
			return null;
		}
		return {
			transX:this._transX,
			transY:this._transY,
			scaleX:this._scaleX,
			scaleY:this._scaleY,
			rotation:this._rotation,
			mirrorH:this._mirrorH,
			mirrorV:this._mirrorV,
		};
	}
	public set transform(value:any){
		if(!value) throw new Error("");
		
		this._transX = value.transX || 0;
		this._transY = value.transY || 0;
		this._scaleX = value.scaleX || 1;
		this._scaleY = value.scaleY || 1;
		this._rotation = value.rotation || 0;
		this._mirrorH = value.mirrorH || false;
		this._mirrorV = value.mirrorV || false;
		
		this.updateMatrix();
	}
	
	public get data():any{
		return {
			class:this,
			id:this._id,
			imageId:this.imageId,
			src:this.imgObj.attr("src"),
			name:this._name,
//			obj:this.img.imgObj,
			transX:this._transX,
			transY:this._transY,
			scaleX:this._scaleX,
			scaleY:this._scaleY,
			rotation:this._rotation,
			mirrorH:this._mirrorH,
			mirrorV:this._mirrorV,
			locked:this._locked,
			visible:this._visible,
			opacity:this._opacity,
			shared:this._shared,
		}
	}

	public get id():number {
		return this._id;
	}

	public get imageId():string {
		return this._imageId;
		//return this.imgObj.data("imageId");
	}

	//
	
	public clone(id:number = -1):Image {
		var retImgObj:any = this.imgObj.clone();
		retImgObj.data("imageId", this.imageId);
		retImgObj.data("name", this.name);
		var retImg:Image = new Image(retImgObj, this.transform, id);
		retImg.visible = this._visible;
		retImg.locked = this._locked;
		retImg.opacity = this._opacity;
		retImg.shared = this._shared;
		return retImg;
	}

	//
	
	private updateMatrix():void{
		var matrix = Matrix4.identity().translate(this._transX, this._transY,0).rotateZ(this._rotation * Math.PI / 180).scale(this._scaleX * (this._mirrorH ? -1 : 1),this._scaleY * (this._mirrorV ? -1 : 1),1);
		var cssMat = "matrix("
			+ matrix.values[0] + ","
			+ matrix.values[1] + ","
			+ matrix.values[4] + ","
			+ matrix.values[5] + ","
			+ matrix.values[12] + ","
			+ matrix.values[13]
			+ ")";
		this.obj.css("transform", cssMat);
	}

	private setOriginalSize(imgObj:any):void{
		var minSize:number = 200;
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
	

	
}
