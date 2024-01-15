import { ImageLayer } from "../model/layer/ImageLayer";
import { EventDispatcher } from "../events/EventDispatcher";
import { Viewer } from "../Viewer";
import { ViewerDocument } from "../model/ViewerDocument";
import { PNGEmbedder } from "./PNGEmbedder";
import { SlideToPNGConverter } from "./SlideToPNGConverter";
import { DateUtil } from "./DateUtil";
import { DataUtil } from "./DataUtil";
import { LayerType } from "../model/Layer";
import { TextLayer } from "../model/layer/TextLayer";
import { ImageManager } from "./ImageManager";
import { Slide } from "../model/Slide";
import JSZip from "jszip";


export enum HVDataType {
	PNG,
	HVD,
	HVZ
}

interface SlideTitle {
	id: number;
	title: string;
	update: number;
}

export class SlideStorage extends EventDispatcher {

	private static readonly VERSION: number = 3;
	private static readonly SAVE_KEY: string = "viewer.slideData";
	private static readonly DBNAME: string = "viewer";
	private static readonly PNG_DATA_FILE_PREFIX: string = "[hv]";

	private db: IDBDatabase;
	private dbVersion: number;
	private titleStore: IDBObjectStore;
	private dataStore: IDBObjectStore;

	private embedder: PNGEmbedder;

	public titles: SlideTitle[] = [];
	public titleById: { [key: number]: string } = {};
	public idByTitle: { [key: string]: number } = {};

	constructor() {
		super();

		let create = () => {
			let openReq = indexedDB.open(SlideStorage.DBNAME);
			openReq.onupgradeneeded = (e: any) => {
				this.db = e.target.result;
				this.db.createObjectStore("slideTitles", { keyPath: "id", autoIncrement: true });
				this.db.createObjectStore("slideData", { keyPath: "title" });
			}
			openReq.onsuccess = (e: any) => {
				this.db = e.target.result;
				this.dbVersion = this.db.version;

				let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");

				this.titleStore = transaction.objectStore("slideTitles");
				this.dataStore = transaction.objectStore("slideData");
				this.updateTitleMenu();
			}
			openReq.onerror = (e: any) => {
				//console.log('db open error');
				alert("db open error");
			}
		};


		if (0) {
			let deleteReq = indexedDB.deleteDatabase(SlideStorage.DBNAME);
			deleteReq.onsuccess = (e: any) => {
				//console.log('db delete success');
				create();
			}
		} else {
			create();
		}

		this.embedder = new PNGEmbedder();
	}

	save(doc: ViewerDocument, isOverride: boolean = false) {
		console.log("save at SlideStorage,", doc, isOverride);

		let title = isOverride ? doc.title : DateUtil.getDateString();
		let id = this.idByTitle[title];

		let jsonStr: string = this.stringifyData(doc);

		//
		let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		// let verify = async (title) => {
		// 	let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		// 	this.dataStore = transaction.objectStore("slideData");
		// 	let getReq = this.dataStore.get(title);
		// 	getReq.onsuccess = async (e: any) => {
		// 		let jsonStr2: string = e.target.result.data;
		// 		if (jsonStr == jsonStr2) {
		// 			alert("[" + title + "] save complete.");
		// 		} else {
		// 			alert("save error!");
		// 		}
		// 	}
		// 	getReq.onerror = async (e: any) => {
		// 		alert("save error!");
		// 	};
		// }


		if (id) {
			this.titleStore.put({ id: id, title: title, update: new Date().getTime() });
		} else {
			this.titleStore.add({ title: title, update: new Date().getTime() });
		}

		this.dataStore.put({ title: title, data: jsonStr },).onsuccess = (e: any) => {
			// verify(title);
			doc.title = title;	//新データとなるのでタイトルを変更
			this.updateTitleMenu();
		}
	}

	public export(doc: ViewerDocument, type: HVDataType, options?: any) {
		let jsonStr: string = this.stringifyData(doc);

		//

		switch (type) {
			case HVDataType.PNG:
				let pages: number[] = options ? (options.pages || []) : [];
				let thumbPng = new SlideToPNGConverter().convert(doc, pages, false);
				var zip = new JSZip();
				zip.file("data.hvd", jsonStr);
				zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })
					.then((u8a) => {
						this.embedder.embed(thumbPng, u8a, (embeddedPngDataURL: string) => {
							DataUtil.downloadBlob(DataUtil.dataURItoBlob(embeddedPngDataURL), SlideStorage.PNG_DATA_FILE_PREFIX + doc.title + ".png");
						});
					});
				break;
			case HVDataType.HVD:
				let blob = new Blob([jsonStr], { type: "text/plain" });
				DataUtil.downloadBlob(blob, doc.title + ".hvd");
				break;
			case HVDataType.HVZ:
				var zip = new JSZip();
				zip.file(doc.title + ".hvd", jsonStr);
				zip.generateAsync({ type: "blob", compression: "DEFLATE" })
					.then((blob) => {
						DataUtil.downloadBlob(blob, doc.title + ".hvz");
					});
				break;
		}
	}


	public load(id: string) {
		let title = this.titleById[id];
		if (!title) return;

		console.log("load at slideStorage", id, title)
		let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.dataStore = transaction.objectStore("slideData");
		let getReq = this.dataStore.get(title);
		getReq.onsuccess = async (e: any) => {
			let jsonStr: string = e.target.result.data;
			this.dispatchEvent(new CustomEvent("loaded", { detail: await this.parseData(jsonStr, { title: title }) }));
		}
		getReq.onerror = async (e: any) => {

		};
	}


	public async import(file: any) {

		if (file.name.indexOf(".png") != -1) {
			let reader = new FileReader();
			let loadFunc = (reader, filePath) => {
				return new Promise<void>(resolve => {
					reader.addEventListener("load", (e: any) => {
						resolve();
					});
					reader.readAsDataURL(filePath);
				});
			}

			try {
				await loadFunc(reader, file);
				let u8a = this.embedder.extract(reader.result as string);
				let zip = new JSZip();
				await zip.loadAsync(u8a);

				let obj = await zip.file("data.hvd").async("uint8array");
				let jsonStr: string = new TextDecoder().decode(obj);
				if (!jsonStr) {
					alert("not data png file.");
					return;
				}
				let title: string = (file.name.split(".png")[0]).split(SlideStorage.PNG_DATA_FILE_PREFIX)[1];
				this.dispatchEvent(new CustomEvent("loaded", { detail: await this.parseData(jsonStr, { title: title }) }));
			}
			catch (e) {
			}

		} else if (file.name.indexOf(".hvz") != -1) {
			try {
				let zip = await JSZip.loadAsync(file);
				zip.forEach(async (a, b) => {
					let data: string = await b.async("string");
					this.dispatchEvent(new CustomEvent("loaded", { detail: await this.parseData(data) }));
				});
			}
			catch (e) {

			}
		} else if (file.name.indexOf(".hvd") != -1) {
			let reader = new FileReader();
			reader.addEventListener("load", async (e: any) => {
				this.dispatchEvent(new CustomEvent("loaded", { detail: await this.parseData(reader.result as string) }));
			});
			try {
				reader.readAsText(file);
			}
			catch (e) {
			}
		}

	}


	public delete(id: string) {
		let title: string = this.titleById[id];

		let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		let deleteReq1 = this.titleStore.delete(parseInt(id));
		if (!title) return;
		let deleteReq2 = this.dataStore.delete(title);
		deleteReq1.onsuccess = (e: any) => {
			this.updateTitleMenu();
		};
	}

	//

	private stringifyData(doc: ViewerDocument): string {
		//MARK : 更新時間上書き
		doc.editTime = new Date().getTime();

		//

		//console.log("stringifyData start ------------");

		let json: any = {};
		json.version = SlideStorage.VERSION;
		json.screen = { width: doc.width, height: doc.height };

		if (doc.bgColor) json.bgColor = doc.bgColor;
		if (doc.createTime) json.createTime = doc.createTime;
		if (doc.editTime) json.editTime = doc.editTime;

		let slideData: any[] = [];
		let imageData: any = {};

		doc.slides.forEach(slide => {
			let slideDatum: any = {};
			slideDatum.id = slide.id;
			slideDatum.durationRatio = slide.durationRatio;
			slideDatum.joining = slide.joining;
			slideDatum.disabled = slide.disabled;

			slideDatum.layers = [];
			slide.layers.forEach(layer => {
				slideDatum.layers.push(layer.getData());
				if (layer.type == LayerType.IMAGE) {
					let imageLayer: ImageLayer = layer as ImageLayer;
					if (imageData[imageLayer.imageId] == undefined) {
						imageData[imageLayer.imageId] = ImageManager.shared.getSrcById(imageLayer.imageId);
					}
				}
			});
			slideData.push(slideDatum);

			json.slideData = slideData;
			json.imageData = imageData;
		});

		let jsonStr: string = JSON.stringify(json);

		//MARK: - debug用トレース
		delete json.imageData;

		return jsonStr;
	}

	private async parseData(jsonStr: string, options?: any) {

		let slides: Slide[] = [];
		options = options || {};

		let json: any = JSON.parse(jsonStr);

		ImageManager.shared.initialize();

		//ver1
		if (json.version == 1 || json.version == undefined) {
			window.alert("too old version.");
			throw new Error("too old version.");
		}

		//ver2
		if (json.version >= 2) {
			let width: number = Viewer.SCREEN_WIDTH;
			let height: number = Viewer.SCREEN_HEIGHT;
			if (json.screen) {
				width = parseInt(json.screen.width) || width;
				height = parseInt(json.screen.height) || height;
			}
			options.width = width;
			options.height = height;

			let imageIds = Object.keys(json.imageData);
			let totalImages = imageIds.length;
			for (let i = 0; i < totalImages; i++) {
				let percentage = i / totalImages;
				this.dispatchEvent(new CustomEvent("loading", { detail: percentage }));

				let imageId = imageIds[i];
				await ImageManager.shared.registImageData(imageId, json.imageData[imageId]);
			}
			this.dispatchEvent(new CustomEvent("loading", { detail: 1 }));

			json.slideData.forEach(slideDatum => {
				let slide: Slide = new Slide(width, height);
				slide.durationRatio = slideDatum.durationRatio || 1;
				slide.joining = Boolean(slideDatum.joining);
				slide.disabled = Boolean(slideDatum.disabled);

				let layers: any[];
				if (json.version >= 2.1) {
					layers = slideDatum.layers;
				} else {
					layers = slideDatum.images;
				}

				layers.forEach(layerDatum => {
					switch (layerDatum.type) {
						case LayerType.TEXT:
							let textLayer = new TextLayer(layerDatum.text, {
								transX: layerDatum.transX,
								transY: layerDatum.transY,
								scaleX: layerDatum.scaleX,
								scaleY: layerDatum.scaleY,
								rotation: layerDatum.rotation,
								mirrorH: layerDatum.mirrorH,
								mirrorV: layerDatum.mirrorV,
							});
							if (layerDatum.opacity != undefined) {
								textLayer.opacity = layerDatum.opacity;
							}
							if (layerDatum.locked != undefined) {
								textLayer.locked = layerDatum.locked;
							}
							if (layerDatum.shared != undefined) {
								textLayer.shared = layerDatum.shared;
							}
							if (layerDatum.visible != undefined) {
								textLayer.visible = layerDatum.visible;
							}
							slide.addLayer(textLayer);
							break;
						case undefined:	//version < 2.1
						case LayerType.IMAGE:
							let img: ImageLayer = new ImageLayer(layerDatum.imageId, {
								transX: layerDatum.transX,
								transY: layerDatum.transY,
								scaleX: layerDatum.scaleX,
								scaleY: layerDatum.scaleY,
								rotation: layerDatum.rotation,
								mirrorH: layerDatum.mirrorH,
								mirrorV: layerDatum.mirrorV,
							});
							if (layerDatum.opacity != undefined) {
								img.opacity = layerDatum.opacity;
							}
							if (layerDatum.locked != undefined) {
								img.locked = layerDatum.locked;
							}
							if (layerDatum.shared != undefined) {
								img.shared = layerDatum.shared;
							}
							if (layerDatum.visible != undefined) {
								img.visible = layerDatum.visible;
							}
							if (layerDatum.clipRect != undefined) {
								img.clipRect = layerDatum.clipRect;
							}
							if (layerDatum.isText != undefined) {
								img.isText = layerDatum.isText;
							}
							if (layerDatum.name != undefined) {
								img.name = layerDatum.name as string;
							}
							slide.addLayer(img);
							break;
					}
				});
				slides.push(slide);
			});

			if (json.bgColor) options.bgColor = json.bgColor;
			if (json.createTime) options.createTime = json.createTime;
			if (json.editTime) options.editTime = json.editTime;

			return new ViewerDocument(slides, options);
		}
	}
	//

	private updateTitleMenu() {
		this.titles = [];
		this.titleById = {};
		this.idByTitle = {};

		this.titleStore.openCursor().onsuccess = (event) => {
			let cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
			if (cursor) {
				let id = parseInt(cursor.value.id);
				let title = cursor.value.title;
				let update = cursor.value.update || 0;
				this.titles.push({ id: id, title: title, update: update });
				this.titleById[id] = title;
				this.idByTitle[title] = id;
				cursor.continue();
			} else {
				this.titles.sort((a, b) => {
					if (a.update == b.update) {
						return a.id > b.id ? 1 : -1

					} else {
						return a.update > b.update ? 1 : -1
					}
				});
				// console.log(this.titles)

				this.dispatchEvent(new Event("update"));
			}
		};
	}

}