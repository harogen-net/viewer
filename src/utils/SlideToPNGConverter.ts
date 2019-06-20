import { VDoc } from "../__core__/model/VDoc";
import { Viewer } from "../Viewer";
import { SlideView } from "../__core__/view/SlideView";
import { ImageLayer } from "../__core__/model/ImageLayer";
import { Layer, LayerType } from "../__core__/model/Layer";
import { ImageManager } from "./ImageManager";
import { Slide } from "../__core__/model/Slide";

declare var $:any;

enum SlidePNGTileType {
	SINGLE = 1,
	QUADRUPLE = 4,
	NONUPLE = 9
}

export class SlideToPNGConverter {

    constructor(){    }

    public convert(doc:VDoc, pages?:number[]):string {
		pages = pages || [];
		var type:SlidePNGTileType = SlidePNGTileType.SINGLE;
		var convertibleSlideNum:number = this.countConvertibleSlideNum(doc);
		if(convertibleSlideNum >= SlidePNGTileType.NONUPLE){
			type = SlidePNGTileType.NONUPLE;
		}else if(convertibleSlideNum >= SlidePNGTileType.QUADRUPLE){
			type = SlidePNGTileType.QUADRUPLE;
		}

		var width:number = doc.width;
		var height:number = doc.height;

		let slideSortFunc = (a:Slide,b:Slide):number=>{
			if(a.durationRatio > b.durationRatio){
				return -1
			}else if(a.durationRatio < b.durationRatio){
				return 1;
			}else{
				return 0;
			}
		}
		var slides:Slide[] = doc.slides.concat();
		slides = slides.sort(slideSortFunc);

		while(pages.length < type && slides.length > 0){
			pages.push(doc.slides.indexOf(slides.shift()));
		}

		var canvas:HTMLCanvasElement = this.slide2canvas(doc.slides[pages[0]], width, height, 1, doc.bgColor);
		return canvas.toDataURL();
	}

	public slide2canvas(slide:Slide, width:number, height:number, scale?:number, bgColor?:string):HTMLCanvasElement {
		var canvas:HTMLCanvasElement = document.createElement("canvas") as HTMLCanvasElement;
		canvas.width = width;
		canvas.height = height;
		this.drawSlide2Canvas(slide,canvas,scale,bgColor);
		return canvas;
	}

	public drawSlide2Canvas(slide:Slide, canvas:HTMLCanvasElement, slideScale?:number, bgColor?:string) {
		var ctx:CanvasRenderingContext2D = canvas.getContext("2d");

		//テスト実装なので、コンパイル時にエラーが出る
		//ctx.resetTransform();
		//よって無理やり実行
		ctx["resetTransform"]();

		if(bgColor){
			ctx.fillStyle = bgColor;
			ctx.fillRect(0,0,canvas.width, canvas.height);
		}else{
			ctx.clearRect(0,0,canvas.width, canvas.height);
		}
		if(!slideScale) slideScale = 1;

		$.each(slide.layers, (number, layer:Layer)=>{
			if(layer.type != LayerType.IMAGE) return;
			var image = layer as ImageLayer;
			if (!image.visible) return;

			var matrix:number[] = layer.matrix;
			ctx["resetTransform"]();


			//※アフィン変換は逆に行われる

			//5 : 最後に全体を拡縮
			if(slideScale != 1) ctx.scale(slideScale, slideScale);

			//４：最後に移動する
			ctx.translate(image.x, image.y);

			//３：原点を中心に回転を行う
			//（ミラー設定前に回転してしまうと方向がおかしくなる、前回のバグはこの順序が原因ではないか）
			ctx.rotate(image.angle);

			//２：原点を中心に拡大縮小を行う（ミラー設定があるので、回転より先に行う）
			ctx.scale(image.scaleX * (image.mirrorH ? -1 : 1), image.scaleY * (image.mirrorV ? -1 : 1));

			//１：最初に画像のサイズの半分だけ動かし、画像の中心を原点に合わせる
			ctx.translate(-image.originWidth  / 2, -image.originHeight / 2);

			ctx.globalAlpha = image.opacity;
			//ctx.drawImage(image.imageElement, 0, 0);
			var element = ImageManager.shared.getImageElementById(image.imageId);
			//if(image.isClipped){
				ctx.drawImage(element, image.clipRect[3], image.clipRect[0],image.clipedWidth, image.clipedHeight,image.clipRect[3],image.clipRect[0],image.clipedWidth, image.clipedHeight);
			//}else{
			//	ctx.drawImage(element, 0,0);
			//}
		});
	}

	private countConvertibleSlideNum(doc:VDoc):number {
		var num:number = 0;
		doc.slides.forEach((slide:Slide)=>{
			if(slide.durationRatio >= 1) num++;
		});
		return num;
	}
}