import { VDoc } from "../__core__/VDoc";
import { Viewer } from "../Viewer";
import { Slide } from "../__core__/Slide";
import { Image } from "../__core__/Image";

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

		var width:number = Viewer.SCREEN_WIDTH;
		var height:number = Viewer.SCREEN_HEIGHT;

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

		var canvas:HTMLCanvasElement = this.slide2canvas(doc.slides[pages[0]], width, height, doc.bgColor);
		return canvas.toDataURL();
	}
	
	public slide2canvas(slide:Slide, width:number, height:number, bgColor?:string):HTMLCanvasElement {
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

			//rotate div
			ctx.translate(img.originWidth  / 2, img.originHeight / 2);
			ctx.rotate(img.angle);
			ctx.translate(-img.originWidth  / 2, -img.originHeight / 2);

			//scale div
			ctx.scale(img.scaleX * (img.mirrorH ? -1 : 1), img.scaleY * (img.mirrorV ? -1 : 1));
			ctx.translate(-img.originWidth  / 2, -img.originHeight / 2);
			
			ctx.globalAlpha = img.opacity;
			ctx.drawImage(img.imageElement, 0, 0);
		});

		return canvas;
	}

	private countConvertibleSlideNum(doc:VDoc):number {
		var num:number = 0;
		doc.slides.forEach((slide:Slide)=>{
			if(slide.durationRatio >= 1) num++;
		});
		return num;
	}
}