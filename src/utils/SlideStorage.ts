import {Slide} from "../__core__/Slide";
import { Image } from "../__core__/layer/Image";
import { EventDispatcher } from "../events/EventDispatcher";
import { Viewer } from "../Viewer";
import { VDoc } from "../__core__/VDoc";
import { PNGEmbedder } from "./PNGEmbedder";
import { SlideToPNGConverter } from "./SlideToPNGConverter";
import { DateUtil } from "./DateUtil";
import { DataUtil } from "./DataUtil";
import { Layer, LayerType } from "../__core__/Layer";
import { TextLayer } from "../__core__/layer/TextLayer";

declare var $:any;
declare var jsSHA:any;
declare var JSZip:any;

export enum HVDataType {
	PNG,
	HVD,
	HVZ
}

export class SlideStorage extends EventDispatcher {

	private static readonly VERSION:number = 2.1;
	private static readonly SAVE_KEY:string = "viewer.slideData";
	private static readonly DBNAME:string = "viewer";
	private static readonly PNG_DATA_FILE_PREFIX:string = "[hv]";

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
		var jsonStr:string = this.stringifyData(doc);

		//
		var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		
		var putReq1  = this.titleStore.put({"title":DateUtil.getDateString()});
		//var putReq1  = this.titleStore.put({"title":doc.title});
		//var putReq2 = this.dataStore.put({title:doc.title, data:jsonStr});
		var putReq2 = this.dataStore.put({title:DateUtil.getDateString(), data:jsonStr});
		putReq2.onsuccess = (e:any)=>{
			this.updateTitleMenu();
		}
	}
	
	public export(doc:VDoc, type:HVDataType, options?:any){
		var jsonStr:string = this.stringifyData(doc);

		//

		switch(type){
			case HVDataType.PNG:
				var pages:number[] = options ? (options.pages || []) : [];
				var thumbPng = new SlideToPNGConverter().convert(doc,pages);
				var zip = new JSZip();
				zip.file("data.hvd",jsonStr);
				zip.generateAsync({type:"uint8array",compression: "DEFLATE"})
				.then((u8a)=>{
					this.embedder.embed(thumbPng, u8a, (embeddedPngDataURL:string)=>{
						DataUtil.downloadBlob(DataUtil.dataURItoBlob(embeddedPngDataURL), SlideStorage.PNG_DATA_FILE_PREFIX + doc.title + ".png");
					});
				});
			break;
			case HVDataType.HVD:
				var blob = new Blob([jsonStr], {type: "text/plain"});
				DataUtil.downloadBlob(blob, doc.title + ".hvd");
			break;
			case HVDataType.HVZ:
				var zip = new JSZip();
				zip.file(doc.title + ".hvd", jsonStr);
				zip.generateAsync({type:"blob",compression: "DEFLATE"})
				.then((blob)=>{
					DataUtil.downloadBlob(blob, doc.title + ".hvz");
				});
			break;
		}
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
						var title:string = (file.name.split(".png")[0]).split(SlideStorage.PNG_DATA_FILE_PREFIX)[1];
						this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(jsonStr, {title:title})}));
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

	private stringifyData(document:VDoc):string {
		//MARK : 更新時間上書き
		document.editTime = new Date().getTime();

		//

		//console.log("stringifyData start ------------");

		var json:any = {};
		json.version = SlideStorage.VERSION;
		json.screen = {width:Viewer.SCREEN_WIDTH, height:Viewer.SCREEN_HEIGHT};
		
		if(document.bgColor) json.bgColor = document.bgColor;
		if(document.createTime) json.createTime = document.createTime;
		if(document.editTime) json.editTime = document.editTime;

		//ver1
		if(SlideStorage.VERSION == 1){
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
		if(SlideStorage.VERSION >= 2){
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

				var layers:Layer[] = [];
				if(SlideStorage.VERSION >= 2.1){
					slideDatum.layers = layers;
				}else{
					slideDatum.images = layers;
				}

				//console.log(" - slide" + (i + 1) + "("+ slide.id + ")" + " has " + slide.images.length + " images");

				$.each(slide.getData(), (number, layerDatum:any)=>{
					delete layerDatum.class;
					//delete datum.id;

					if(layerDatum.type == LayerType.IMAGE && imageSrcData[layerDatum.imageId] == undefined){
						imageSrcData[layerDatum.imageId] = layerDatum.src;
						imageNum++;
					}
					delete layerDatum.src;
					layers.push(layerDatum);
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

	private parseData(jsonStr:string, options?:any):VDoc {

		var slides:Slide[] = [];
		options = options || {};

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
					slide.addLayer(img);
				});
				slides.push(slide);
			});
		}

		//ver2
		if(json.version >= 2){
			var isScreenSizeChange:boolean = (json.screen.width != Viewer.SCREEN_WIDTH || json.screen.height != Viewer.SCREEN_HEIGHT);

			$.each(json.slideData, (number, slideDatum:any)=>{
				var slide:Slide = new Slide($('<div />'));
				slide.durationRatio = slideDatum.durationRatio;
				slide.joining = slideDatum.joining;
				slide.isLock = slideDatum.isLock;
				var layers:Layer[];
				if(json.version >= 2.1){
					layers = slideDatum.layers;
				}else{
					layers = slideDatum.images;
				}

				$.each(layers, (j:number, layerDatum:any)=>{
					switch(layerDatum.type){
						case LayerType.TEXT:
							var textLayer = new TextLayer(layerDatum.text, {
								transX:layerDatum.transX,
								transY:layerDatum.transY,
								scaleX:layerDatum.scaleX,
								scaleY:layerDatum.scaleY,
								rotation:layerDatum.rotation,
								mirrorH:layerDatum.mirrorH,
								mirrorV:layerDatum.mirrorV,
							});
							if(layerDatum.opacity != undefined){
								textLayer.opacity = layerDatum.opacity;						
							}
							if(layerDatum.locked != undefined){
								textLayer.locked = layerDatum.locked;
							}
							if(layerDatum.shared != undefined){
								textLayer.shared = layerDatum.shared;
							}
							if(isScreenSizeChange){
								var offsetScale:number = Math.min(
									Viewer.SCREEN_WIDTH / json.screen.width,
									Viewer.SCREEN_HEIGHT / json.screen.height
								);
								var offsetX:number = (Viewer.SCREEN_WIDTH - json.screen.width * offsetScale) >> 1;
								var offsetY:number = (Viewer.SCREEN_HEIGHT - json.screen.height * offsetScale) >> 1;
		
								textLayer.moveTo((textLayer.x * offsetScale) + offsetX,(textLayer.y * offsetScale) + offsetY);
								textLayer.scaleBy(offsetScale);
							}
							slide.addLayer(textLayer);
						break;
						case undefined:	//version < 2.1
						case LayerType.IMAGE:
							var imgObj:any = $("<img />");
							imgObj.attr("src", json.imageData[layerDatum.imageId]);
							imgObj.data("imageId", layerDatum.imageId);
							if(layerDatum.name != undefined){
								imgObj.data("name",layerDatum.name);
							}
							var img:Image = new Image(imgObj, {
								transX:layerDatum.transX,
								transY:layerDatum.transY,
								scaleX:layerDatum.scaleX,
								scaleY:layerDatum.scaleY,
								rotation:layerDatum.rotation,
								mirrorH:layerDatum.mirrorH,
								mirrorV:layerDatum.mirrorV,
							});
							if(layerDatum.opacity != undefined){
								img.opacity = layerDatum.opacity;						
							}
							if(layerDatum.locked != undefined){
								img.locked = layerDatum.locked;
							}
							if(layerDatum.shared != undefined){
								img.shared = layerDatum.shared;
							}
							if(layerDatum.clipRect != undefined){
								img.clipRect = layerDatum.clipRect;
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
							slide.addLayer(img);
						break;
					}
				});
				slides.push(slide);
			});

			if(json.bgColor) options.bgColor = json.bgColor;
			if(json.createTime) options.createTime = json.createTime;
			if(json.editTime) options.editTime = json.editTime;
			//if(json.title) options.title = json.title;
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