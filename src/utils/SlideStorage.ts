import {Slide} from "../__core__/Slide";
import { Image } from "../__core__/Image";
import { EventDispatcher } from "../events/EventDispatcher";
import { Viewer } from "../Viewer";
import { VDoc } from "../__core__/VDoc";

declare var $:any;
declare var jsSHA:any;
declare var JSZip:any;

export class SlideStorage extends EventDispatcher {

	private static readonly VERSION:number = 2;
	private static readonly SAVE_KEY:string = "viewer.slideData";
	private static readonly DBNAME:string = "viewer";

	private db:any;
	private dbVersion:number;
	private titleStore:any;
	private dataStore:any;

/*	public bgColor:string | undefined;*/
/*	public duration:number;
	public interval:number;*/
/*    public slides:Slide[];*/

    constructor() {
		super();

		let create = ()=>{
			var openReq  = indexedDB.open(SlideStorage.DBNAME);
			openReq.onupgradeneeded = (e:any)=>{
				this.db = e.target.result;
				console.log('db upgrade');
				this.db.createObjectStore("slideTitles", {keyPath:"id",autoIncrement:true});
				this.db.createObjectStore("slideData",{keyPath:"title"});
			}
			openReq.onsuccess = (e:any)=>{
				this.db = e.target.result;
				this.dbVersion = this.db.version;
				console.log('db open success : ' + this.dbVersion);

				var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");

				this.titleStore = transaction.objectStore("slideTitles");
				this.dataStore = transaction.objectStore("slideData");
				console.log(this.titleStore, this.dataStore);

				//var putReq = this.titleStore.put({title:"a"});this.titleStore.put({title:"b"});this.titleStore.put({title:"c"});

				//putReq.onsuccess = (e:any)=>{
				//	var getReq = this.titleStore.get(1);
				//	getReq.onsuccess = (e:any)=>{
				//		console.log(e.target.result); // {id : 'A1', name : 'test'}
				//	  }


					  this.updateTitleMenu();

			  //}
			}
			openReq.onerror = (e:any)=>{
				console.log('db open error');
				alert("db open error");
			}
		};


		if(0) {
			var deleteReq = indexedDB.deleteDatabase(SlideStorage.DBNAME);
			deleteReq.onsuccess = (e:any)=>{
				console.log('db delete success');
				create();
			}
		}else{
			create();
		}

    }

    save(document:VDoc){

		//var titleId:number = parseInt($('select.filename').val());
		var title:string// = $('select.filename option:selected').text();

//		if(titleId == -1){
			title = this.getNowString();
//		}
		var jsonStr:string = this.stringfyData(document);

		//
		var transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		var putReq1  = this.titleStore.put({"title":title});
		var putReq2 = this.dataStore.put({title:title, data:jsonStr});
		putReq2.onsuccess = (e:any)=>{
			this.updateTitleMenu();
		}
	}
	
	public export(document:VDoc, isZip:boolean = true){
		var title = this.getNowString();
		var jsonStr:string = this.stringfyData(document);

		//

		if(isZip){
			var zip = new JSZip();
			zip.file(title + ".hvd", jsonStr);
			zip.generateAsync({type:"blob",compression: "DEFLATE"})
			.then((blob)=>{
				this.downloadBlob(blob, title + ".hvz");
			});
		}else{
			var blob = new Blob([jsonStr], {type: "text/plain"});
			this.downloadBlob(blob, title + ".hvd");
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
//			console.log(e.target.result); // {id : 'A1', name : 'test'}
			var jsonStr:string = e.target.result.data;
			this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(jsonStr)}));
		}
	}


	public import(file:any){
		if(file.name.indexOf(".hvz") != -1){
			JSZip.loadAsync(file).then((zip)=>{
				zip.forEach((a,b)=>{
					b.async("string").then((data:string)=>{
						this.dispatchEvent(new CustomEvent("loaded", {detail:this.parseData(data)}));
					});
				});
			},(e)=>{
				console.log("error at zip load : " + e);
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

	private getNowString():string{
		var date = new Date();
		var y = date.getFullYear();
		var m = ("00" + (date.getMonth()+1)).slice(-2);
		var d = ("00" + (date.getDate())).slice(-2);
		var h = ("00" + (date.getHours())).slice(-2);
		var mi = ("00" + (date.getMinutes())).slice(-2);
		var s = ("00" + (date.getSeconds())).slice(-2);
		return "" + y + m + d + h + mi + s;
	}

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
			
			$.each(document.slides, (number, slide:Slide)=>{
				var slideDatum:any = {};
				slideDatum.durationRatio = slide.durationRatio;
				slideDatum.joining = slide.joining;
				slideDatum.isLock = slide.isLock;
				slideDatum.images = [];

				$.each(slide.getData(), (number, datum:any)=>{
					delete datum.class;
					//delete datum.id;

					if(imageSrcData[datum.imageId] == undefined){
						imageSrcData[datum.imageId] = datum.src;
					}
					delete datum.src;
					slideDatum.images.push(datum);
				});
				slideData.push(slideDatum);
			});
			json.slideData = slideData;
			json.imageData = imageSrcData;
		}

		var jsonStr:string = JSON.stringify(json);
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
				//console.log(cursor);
				$("select.filename").append('<option value="' + cursor.value.id + '">' + cursor.value.title + '</option>');
				cursor.continue();
			}else{
//				$("select.filename option:last-child").prop("selected",true);
			}
		};
	}

}