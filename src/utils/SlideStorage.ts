import {SlideView} from "../__core__/view/SlideView";
import { ImageLayer } from "../__core__/model/ImageLayer";
import { EventDispatcher } from "../events/EventDispatcher";
import { Viewer } from "../Viewer";
import { VDoc } from "../__core__/model/VDoc";
import { PNGEmbedder } from "./PNGEmbedder";
import { SlideToPNGConverter } from "./SlideToPNGConverter";
import { DateUtil } from "./DateUtil";
import { DataUtil } from "./DataUtil";
import { Layer, LayerType } from "../__core__/model/Layer";
import { TextLayer } from "../__core__/model/TextLayer";
import { CanvasSlideView } from "../slide/CanvasSlideView";
import { ImageManager } from "./ImageManager";
import { Slide } from "../__core__/model/Slide";


declare var $:any;
declare var jsSHA:any;
declare var JSZip:any;

export enum HVDataType {
	PNG,
	HVD,
	HVZ
}

export class SlideStorage extends EventDispatcher {

	private static readonly VERSION:number = 3;
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
		getReq.onsuccess = async (e:any)=>{
//			//console.log(e.target.result); // {id : 'A1', name : 'test'}
			var jsonStr:string = e.target.result.data;
			this.dispatchEvent(new CustomEvent("loaded", {detail:await this.parseData(jsonStr)}));
		}
	}


	public async import(file:any){
		
		if(file.name.indexOf(".png") != -1){
			var reader = new FileReader();
			var loadFunc = (reader, filePath)=>{
				return new Promise(resolve=>{
					reader.addEventListener("load", (e:any)=>{
						resolve();
					});
					reader.readAsDataURL(filePath);
				});
			}

			try{
				await loadFunc(reader, file);
				var u8a = this.embedder.extract(reader.result as string);
				var zip = new JSZip();
				await zip.loadAsync(u8a);

				var obj = await zip.file("data.hvd").async("uint8array");
				var jsonStr:string = new TextDecoder().decode(obj);
				if(!jsonStr) {
					alert("not data png file.");
					return;
				}
				var title:string = (file.name.split(".png")[0]).split(SlideStorage.PNG_DATA_FILE_PREFIX)[1];
				this.dispatchEvent(new CustomEvent("loaded", {detail: await this.parseData(jsonStr, {title:title})}));
			}
			catch(e){
			}

		}else if(file.name.indexOf(".hvz") != -1){
			try{
				var zip = await JSZip.loadAsync(file);
				zip.forEach(async (a,b)=>{
					var data:string = await b.async("string");
					this.dispatchEvent(new CustomEvent("loaded", {detail:await this.parseData(data)}));
				});
			}
			catch(e){

			}
		}else if(file.name.indexOf(".hvd") != -1){
			var reader = new FileReader();
			reader.addEventListener("load", async (e:any)=>{
				this.dispatchEvent(new CustomEvent("loaded", {detail:await this.parseData(reader.result as string)}));
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

	private stringifyData(doc:VDoc):string {
		//MARK : 更新時間上書き
		doc.editTime = new Date().getTime();

		//

		//console.log("stringifyData start ------------");

		var json:any = {};
		json.version = SlideStorage.VERSION;
		json.screen = {width:doc.width, height:doc.height};
		
		if(doc.bgColor) json.bgColor = doc.bgColor;
		if(doc.createTime) json.createTime = doc.createTime;
		if(doc.editTime) json.editTime = doc.editTime;

		var slideData:any[] = [];
		var imageData:any = {};
		
		doc.slides.forEach(slide=>{
			var slideDatum:any = {};
			slideDatum.id = slide.id;
			slideDatum.durationRatio = slide.durationRatio;
			slideDatum.joining = slide.joining;
			slideDatum.disabled = slide.disabled;

			slideDatum.layers = [];
			slide.layers.forEach(layer=>{
				slideDatum.layers.push(layer.getData());
				if(layer.type == LayerType.IMAGE) {
					var imageLayer:ImageLayer = layer as ImageLayer;
					if(imageData[imageLayer.imageId] == undefined){
						imageData[imageLayer.imageId] = ImageManager.shared.getSrcById(imageLayer.imageId);
					}
				}
			});
			slideData.push(slideDatum);

			json.slideData = slideData;
			json.imageData = imageData;
		});

		var jsonStr:string = JSON.stringify(json);

		//MARK: - debug用トレース
		delete json.imageData;
		console.log(JSON.stringify(json));

		return jsonStr;
	}

	private async parseData(jsonStr:string, options?:any) {

			var slides:Slide[] = [];
			options = options || {};
	
			var json:any = JSON.parse(jsonStr);
	
			ImageManager.shared.deleteAllImageData();
	
			//ver1
			if(json.version == 1 || json.version == undefined){
				// $.each(json.data, (i:number, imageData:any)=>{
				// 	var slide:SlideView = new ThumbSlide($('<div />'));
				// 	//var slide:Slide = new Slide($('<div />'));
				// 	$.each(imageData, (j:number, datum:any)=>{
				// 		var imgObj:any = $("<img />");
				// 		imgObj.attr("src",datum.src);
				// 		if(datum.imageId == undefined || datum.imageId == ""){
				// 			var shaObj = new jsSHA("SHA-256","TEXT");
				// 			shaObj.update(datum.src);
				// 			datum.imageId = shaObj.getHash("HEX");
				// 		}
				// 		imgObj.data("imageId",datum.imageId);
				// 		var img:Image = new Image(imgObj, {
				// 			transX:datum.transX,
				// 			transY:datum.transY,
				// 			scaleX:datum.scaleX,
				// 			scaleY:datum.scaleY,
				// 			rotation:datum.rotation
				// 		});
				// 		slide.addLayer(img);
				// 	});
				// 	slides.push(slide);
				// });
			}
	
		//ver2
		if(json.version >= 2){
			var width:number = Viewer.SCREEN_WIDTH;
			var height:number = Viewer.SCREEN_HEIGHT;
			if(json.screen){
				width = parseInt(json.screen.width) || width;
				height = parseInt(json.screen.height) || height;
			}
			options.width = width;
			options.height = height;

			for (let imageId in json.imageData){
				await ImageManager.shared.registImageData(imageId, json.imageData[imageId]);
			}

			$.each(json.slideData, (number, slideDatum:any)=>{
				var slide:Slide = new Slide(width, height);
				slide.durationRatio = slideDatum.durationRatio;
				slide.joining = slideDatum.joining;
				slide.disabled = slideDatum.disabled;
				
				var layers:any[];
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
							if(layerDatum.visible != undefined){
								textLayer.visible = layerDatum.visible;
							}
							slide.addLayer(textLayer);
						break;
						case undefined:	//version < 2.1
						case LayerType.IMAGE:
							var img:ImageLayer = new ImageLayer(layerDatum.imageId, {
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
							if(layerDatum.visible != undefined){
								img.visible = layerDatum.visible;
							}
							if(layerDatum.clipRect != undefined){
								img.clipRect = layerDatum.clipRect;
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

			return new VDoc(slides, options);
		}
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