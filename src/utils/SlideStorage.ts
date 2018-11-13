import {Slide} from "../__core__/Slide";
import { Image } from "../__core__/Image";
import { EventDispatcher } from "../events/EventDispatcher";
import { Viewer } from "../Viewer";
import { VDoc } from "../__core__/VDoc";
import { PNGEmbedder } from "./PNGEmbedder";
import { SlideToPNGConverter } from "./SlideToPNGConverter";
import { DateUtil } from "./DateUtil";

declare var $:any;
declare var jsSHA:any;
declare var JSZip:any;

export enum HVDataType {
	PNG,
	HVD,
	HVZ
}

export class SlideStorage extends EventDispatcher {

	private static readonly VERSION:number = 2;
	private static readonly SAVE_KEY:string = "viewer.slideData";
	private static readonly DBNAME:string = "viewer";

	private db:any;
	private dbVersion:number;
	private titleStore:any;
	private dataStore:any;

	private embedder:PNGEmbedder;

    constructor() {
		super();

		let create = ()=>{
			var openReq  = indexedDB.open(SlideStorage.DBNAME);
			openReq.onupgradeneeded = (e:any)=>{
				this.db = e.target.result;
				//console.log('db upgrade');
				this.db.createObjectStore("slideTitles", {keyPath:"id",autoIncrement:true});
				this.db.createObjectStore("slideData",{keyPath:"title"});
			}
			openReq.onsuccess = (e:any)=>{
				this.db = e.target.result;
				this.dbVersion = this.db.version;
				//console.log('db open success : ' + this.dbVersion);

				var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");

				this.titleStore = transaction.objectStore("slideTitles");
				this.dataStore = transaction.objectStore("slideData");
				//console.log(this.titleStore, this.dataStore);

				//var putReq = this.titleStore.put({title:"a"});this.titleStore.put({title:"b"});this.titleStore.put({title:"c"});

				//putReq.onsuccess = (e:any)=>{
				//	var getReq = this.titleStore.get(1);
				//	getReq.onsuccess = (e:any)=>{
				//		//console.log(e.target.result); // {id : 'A1', name : 'test'}
				//	  }


					  this.updateTitleMenu();

			  //}
			}
			openReq.onerror = (e:any)=>{
				//console.log('db open error');
				alert("db open error");
			}
		};


		if(0) {
			var deleteReq = indexedDB.deleteDatabase(SlideStorage.DBNAME);
			deleteReq.onsuccess = (e:any)=>{
				//console.log('db delete success');
				create();
			}
		}else{
			create();
		}

		this.embedder = new PNGEmbedder();
    }

    save(doc:VDoc){
		var jsonStr:string = this.stringfyData(doc);

		//
		var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		var putReq1  = this.titleStore.put({"title":doc.title});
		var putReq2 = this.dataStore.put({title:doc.title, data:jsonStr});
		putReq2.onsuccess = (e:any)=>{
			this.updateTitleMenu();
		}
	}
	
	public export(doc:VDoc, type:HVDataType){
		var jsonStr:string = this.stringfyData(doc);

		//

		switch(type){
			case HVDataType.PNG:
				var thumbPng = new SlideToPNGConverter().convert(doc);
				var zip = new JSZip();
				zip.file("data.hvd",jsonStr);
				zip.generateAsync({type:"uint8array",compression: "DEFLATE"})
				.then((u8a)=>{
					this.embedder.embed(thumbPng, u8a, (embeddedPngDataURL:string)=>{
						this.downloadBlob(this.dataURItoBlob(embeddedPngDataURL), "[hv]" + doc.title + ".png");
					});
				});
			break;
			case HVDataType.HVD:
				var blob = new Blob([jsonStr], {type: "text/plain"});
				this.downloadBlob(blob, doc.title + ".hvd");
			break;
			case HVDataType.HVZ:
				var zip = new JSZip();
				zip.file(doc.title + ".hvd", jsonStr);
				zip.generateAsync({type:"blob",compression: "DEFLATE"})
				.then((blob)=>{
					this.downloadBlob(blob, doc.title + ".hvz");
				});
			break;
		}
	}



	private dataURItoBlob(dataURI) {
		// convert base64 to raw binary data held in a string
		// doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
		var byteString = atob(dataURI.split(',')[1]);
	  
		// separate out the mime component
		var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
	  
		// write the bytes of the string to an ArrayBuffer
		var ab = new ArrayBuffer(byteString.length);
	  
		// create a view into the buffer
		var ia = new Uint8Array(ab);
	  
		// set the bytes of the buffer to the correct values
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}
	  
		// write the ArrayBuffer to a blob, and you're done
		var blob = new Blob([ab], {type: mimeString});
		return blob;
	  
	  }


    public load() {
		//this.slides = [];
		var title:string = $('select.filename option:selected').text();
		if(title == "new") return;

		var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.dataStore = transaction.objectStore("slideData");
		var getReq = this.dataStore.get(title);
		getReq.onsuccess = (e:any)=>{
//			//console.log(e.target.result); // {id : 'A1', name : 'test'}
			var jsonStr:string = e.target.result.data;
			this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(jsonStr)}));
		}
	}


	public import(file:any){
		
		if(file.name.indexOf(".png") != -1){
			var reader = new FileReader();
			reader.addEventListener("load", (e:any)=>{
				var u8a = this.embedder.extract(reader.result as string);
				var zip = new JSZip();
				zip.loadAsync(u8a).then((zip)=>{
					zip.file("data.hvd").async("uint8array").then((obj)=>{
						//console.log(new TextDecoder().decode(obj));
						var jsonStr:string = new TextDecoder().decode(obj);
						if(!jsonStr) {
							alert("not data png file.");
							return;
						}
						this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(jsonStr)}));
					});
				})
			});
			try{
				reader.readAsDataURL(file);
			}
			catch(e){
			}
		}else if(file.name.indexOf(".hvz") != -1){
			JSZip.loadAsync(file).then((zip)=>{
				zip.forEach((a,b)=>{
					b.async("string").then((data:string)=>{
						this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(data)}));
					});
				});
			},(e)=>{
				//console.log("error at zip load : " + e);
			});
		}else if(file.name.indexOf(".hvd") != -1){
			var reader = new FileReader();
			reader.addEventListener("load", (e:any)=>{
				this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(reader.result as string)}));
			});
			try{
				reader.readAsText(file);
			}
			catch(e){
			}
		}

	}


	public delete() {
		var title:string = $('select.filename option:selected').text();
		var titleId:number = parseInt($("select.filename").val());
		if(titleId == -1) return;
		var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");

		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		var deleteReq1  = this.titleStore.delete(titleId);
		var deleteReq2 = this.dataStore.delete(title);
		deleteReq1.onsuccess = (e:any)=>{
			this.updateTitleMenu();
		};
	}

	//

	private downloadBlob(blob:any, fileName:string){
		var a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.target = '_blank';
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(a.href);
		//document.body.removeChild(a);
	}

	//

	private stringfyData(document:VDoc):string {
		//MARK : 更新時間上書き
		document.editTime = new Date().getTime();

		//

		//console.log("stringfyData start ------------");

		var json:any = {};
		json.version = SlideStorage.VERSION;
		json.screen = {width:Viewer.SCREEN_WIDTH, height:Viewer.SCREEN_HEIGHT};
		
		if(document.bgColor) json.bgColor = document.bgColor;
		if(document.createTime) json.createTime = document.createTime;
		if(document.editTime) json.editTime = document.editTime;

		//ver1
		if(SlideStorage.VERSION == 1){
			json.version = 1;
			var slideData:any[] = [];
			$.each(document.slides, (i:number, slide:Slide)=>{
				var imageData:any[] = [];
				$.each(slide.getData(), (j:number, datum:any)=>{
					delete datum.class;
					imageData.push(datum);
				});
				slideData.push(imageData);
			});
			json.data = slideData;
		}

		//ver2
		if(SlideStorage.VERSION == 2){
			var slideData:any[] = [];
			var imageSrcData:any = {};
			
			var imageNum:number = 0;
			//console.log("total slide num : " + document.slides.length);
			$.each(document.slides, (i:number, slide:Slide)=>{
				var slideDatum:any = {};
				slideDatum.id = slide.id;
				slideDatum.durationRatio = slide.durationRatio;
				slideDatum.joining = slide.joining;
				slideDatum.isLock = slide.isLock;
				slideDatum.images = [];

				//console.log(" - slide" + (i + 1) + "("+ slide.id + ")" + " has " + slide.images.length + " images");

				$.each(slide.getData(), (number, datum:any)=>{
					delete datum.class;
					//delete datum.id;

					if(imageSrcData[datum.imageId] == undefined){
						imageSrcData[datum.imageId] = datum.src;
						imageNum++;
					}
					delete datum.src;
					slideDatum.images.push(datum);
				});
				slideData.push(slideDatum);
			});
			json.slideData = slideData;
			json.imageData = imageSrcData;

			//console.log("total image num : " + imageNum);
			
		}

		var jsonStr:string = JSON.stringify(json);

		//MARK: - debug用トレース
		delete json.imageData;
		//console.log(JSON.stringify(json));

		return jsonStr;
	}

	private parseData(jsonStr:string):VDoc {

		var slides:Slide[] = [];
		var options:any = {};

		var json:any = JSON.parse(jsonStr);

		//ver1
		if(json.version == 1 || json.version == undefined){
			$.each(json.data, (i:number, imageData:any)=>{
				var slide:Slide = new Slide($('<div />'));
				$.each(imageData, (j:number, datum:any)=>{
					var imgObj:any = $("<img />");
					imgObj.attr("src",datum.src);
					if(!datum.imageId){
						var shaObj = new jsSHA("SHA-256","TEXT");
						shaObj.update(datum.src);
						datum.imageId = shaObj.getHash("HEX");
					}
					imgObj.data("imageId",datum.imageId);
					var img:Image = new Image(imgObj, {
						transX:datum.transX,
						transY:datum.transY,
						scaleX:datum.scaleX,
						scaleY:datum.scaleY,
						rotation:datum.rotation
					});
					slide.addImage(img);
				});
				slides.push(slide);
			});
		}

		//ver2
		if(json.version == 2){
			var isScreenSizeChange:boolean = (json.screen.width != Viewer.SCREEN_WIDTH || json.screen.height != Viewer.SCREEN_HEIGHT);

			$.each(json.slideData, (number, slideDatum:any)=>{
				var slide:Slide = new Slide($('<div />'));
				slide.durationRatio = slideDatum.durationRatio;
				slide.joining = slideDatum.joining;
				slide.isLock = slideDatum.isLock;

				$.each(slideDatum.images, (j:number, imageDatum:any)=>{
					var imgObj:any = $("<img />");
					imgObj.attr("src", json.imageData[imageDatum.imageId]);
					imgObj.data("imageId",imageDatum.imageId);
					if(imageDatum.name != undefined){
						imgObj.data("name",imageDatum.name);
					}
					var img:Image = new Image(imgObj, {
						transX:imageDatum.transX,
						transY:imageDatum.transY,
						scaleX:imageDatum.scaleX,
						scaleY:imageDatum.scaleY,
						rotation:imageDatum.rotation,
						mirrorH:imageDatum.mirrorH,
						mirrorV:imageDatum.mirrorV,
					});
					if(imageDatum.opacity != undefined){
						img.opacity = imageDatum.opacity;						
					}
					if(imageDatum.locked != undefined){
						img.locked = imageDatum.locked;
					}
					if(imageDatum.shared != undefined){
						img.shared = imageDatum.shared;
					}
					if(isScreenSizeChange){
						var offsetScale:number = Math.min(
							Viewer.SCREEN_WIDTH / json.screen.width,
							Viewer.SCREEN_HEIGHT / json.screen.height
						);
						var offsetX:number = (Viewer.SCREEN_WIDTH - json.screen.width * offsetScale) >> 1;
						var offsetY:number = (Viewer.SCREEN_HEIGHT - json.screen.height * offsetScale) >> 1;

						imgObj.ready(()=>{
							img.moveTo((img.x * offsetScale) + offsetX,(img.y * offsetScale) + offsetY);
							img.scaleBy(offsetScale);
						});
					}

					slide.addImage(img);
				});
				slides.push(slide);
			});

			if(json.bgColor) options.bgColor = json.bgColor;
			if(json.createTime) options.createTime = json.createTime;
			if(json.editTime) options.editTime = json.editTime;
			if(json.title) options.title = json.title;
		}

		return new VDoc(slides, options);
	}
	//
	
	private updateTitleMenu() {
		var newItem = $("select.filename option")[0];
		$("select.filename").empty();
		$("select.filename").append($(newItem));

		this.titleStore.openCursor().onsuccess = function (event) {
			var cursor = event.target.result;
			if (cursor) {
				////console.log(cursor);
				$("select.filename").append('<option value="' + cursor.value.id + '">' + cursor.value.title + '</option>');
				cursor.continue();
			}else{
//				$("select.filename option:last-child").prop("selected",true);
			}
		};
	}

}