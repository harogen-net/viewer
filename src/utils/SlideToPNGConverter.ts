import { VDoc } from "../__core__/VDoc";
import { Viewer } from "../Viewer";
import { Slide } from "../__core__/Slide";
import { Image } from "../__core__/Image";

declare var $:any;

export class SlideToPNGConverter {

    constructor(){    }

    public convert(doc:VDoc):string {
		var width:number = Viewer.SCREEN_WIDTH;
		var height:number = Viewer.SCREEN_HEIGHT;
		var canvas:HTMLCanvasElement = this.slide2canvas(doc.slides[0], width, height, doc.bgColor);
		return canvas.toDataURL();
	}
	
	private slide2canvas(slide:Slide, width:number, height:number, bgColor?:string):HTMLCanvasElement {
		var canvas:HTMLCanvasElement = document.createElement("canvas") as HTMLCanvasElement;
		canvas.width = width;
		canvas.height = height;
		var ctx:CanvasRenderingContext2D = canvas.getContext("2d");
		if(bgColor){
			ctx.fillStyle = bgColor;
			ctx.fillRect(0,0,canvas.width, canvas.height);
		}

		$.each(slide.images, (number, img:Image)=>{
			var matrix:number[] = img.matrix;
			ctx.setTransform(1,0,0,1,1,1);

			//translate div
			ctx.translate(img.x, img.y);
			//scale div
			ctx.scale(img.scaleX * (img.mirrorH ? -1 : 1), img.scaleY * (img.mirrorV ? -1 : 1));
			ctx.translate(-img.originWidth  / 2, -img.originHeight / 2);

			//rotate div
			ctx.translate(img.originWidth  / 2, img.originHeight / 2);
			ctx.rotate(img.angle);
			ctx.translate(-img.originWidth  / 2, -img.originHeight / 2);

			
			ctx.globalAlpha = img.opacity;
			ctx.drawImage(img.imageElement, 0, 0);
		});

		return canvas;
	}
}