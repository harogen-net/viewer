import JSZip from "jszip";
import { attachEventDispatcher, type EventDispatcher } from "../events/EventDispatcher";
import { LayerType } from "../model/Layer";
import { createImageLayer, ImageLayer } from "../model/layer/ImageLayer";
import { createTextLayer } from "../model/layer/TextLayer";
import { createSlide, Slide } from "../model/Slide";
import { createViewerDocument, type ViewerDocument } from "../model/ViewerDocument";
import {
	createStorageOperationError,
	StorageErrorCode,
	type StorageExportOptions,
} from "../storage/StorageAdapter";
import { HVDataType, SlideTitle } from "../storage/storageTypes";
import { Viewer } from "../Viewer";
import { DataUtil } from "./DataUtil";
import { DateUtil } from "./DateUtil";
import { ImageManager } from "./ImageManager";
import { PNGEmbedder } from "./PNGEmbedder";
import { SlideToPNGConverter } from "./SlideToPNGConverter";

export class SlideStorage {
	declare listeners: EventDispatcher["listeners"];
	declare dispatchEvent: EventDispatcher["dispatchEvent"];
	declare addEventListener: EventDispatcher["addEventListener"];
	declare removeEventListener: EventDispatcher["removeEventListener"];
	declare clearEventListener: EventDispatcher["clearEventListener"];
	declare containEventListener: EventDispatcher["containEventListener"];
	declare hasEventListener: EventDispatcher["hasEventListener"];

	private static instance: SlideStorage;

	public static getInstance(): SlideStorage {
		if (!SlideStorage.instance) {
			SlideStorage.instance = new SlideStorage();
		}
		return SlideStorage.instance;
	}

	private static readonly VERSION: number = 3;
	private static readonly DBNAME: string = "viewer";
	private static readonly PNG_DATA_FILE_PREFIX: string = "[hv]";

	private db: IDBDatabase;
	private titleStore: IDBObjectStore;
	private dataStore: IDBObjectStore;

	private embedder: PNGEmbedder;

	private dispatchStorageError(
		message: string,
		code: StorageErrorCode = StorageErrorCode.STORAGE_IO_ERROR
	) {
		this.dispatchEvent(
			new CustomEvent("error", { detail: createStorageOperationError(code, message) })
		);
	}

	public titles: SlideTitle[] = [];
	public titleById: { [key: number]: string } = {};
	public idByTitle: { [key: string]: number } = {};

	private constructor() {
		attachEventDispatcher(this);

		let create = () => {
			let openReq = indexedDB.open(SlideStorage.DBNAME);
			openReq.onupgradeneeded = (e: IDBVersionChangeEvent) => {
				this.db = (e.target as IDBOpenDBRequest).result;
				this.db.createObjectStore("slideTitles", { keyPath: "id", autoIncrement: true });
				this.db.createObjectStore("slideData", { keyPath: "title" });
			};
			openReq.onsuccess = (e: Event) => {
				this.db = (e.target as IDBOpenDBRequest).result;

				let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");

				this.titleStore = transaction.objectStore("slideTitles");
				this.dataStore = transaction.objectStore("slideData");
				this.updateTitleMenu();
			};
			openReq.onerror = () => {
				this.dispatchStorageError("db open error", StorageErrorCode.STORAGE_IO_ERROR);
			};
		};

		if (0) {
			let deleteReq = indexedDB.deleteDatabase(SlideStorage.DBNAME);
			deleteReq.onsuccess = () => {
				//console.log('db delete success');
				create();
			};
		} else {
			create();
		}

		this.embedder = new PNGEmbedder();
	}

	save(doc: ViewerDocument, isOverride: boolean = false): Promise<void> {
		console.log("save at SlideStorage,", doc, isOverride);

		let title = doc.title;
		let id = this.idByTitle[title];

		let jsonStr: string = this.stringifyData(doc);

		//
		let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		return new Promise<void>((resolve, reject) => {
			const onRequestError = () => {
				reject(
					createStorageOperationError(StorageErrorCode.STORAGE_IO_ERROR, "save request failed")
				);
			};

			if (id) {
				const titlePutReq = this.titleStore.put({
					id: id,
					title: title,
					update: new Date().getTime(),
				});
				titlePutReq.onerror = onRequestError;
			} else {
				const titleAddReq = this.titleStore.add({ title: title, update: new Date().getTime() });
				titleAddReq.onerror = onRequestError;
			}

			const dataPutReq = this.dataStore.put({ title: title, data: jsonStr });
			dataPutReq.onerror = onRequestError;
			dataPutReq.onsuccess = () => {
				this.updateTitleMenu();
				resolve();
			};
		});
	}

	public export(
		doc: ViewerDocument,
		type: HVDataType,
		options?: StorageExportOptions
	): Promise<void> {
		let jsonStr: string = this.stringifyData(doc);

		//

		switch (type) {
			case HVDataType.PNG:
				return new Promise<void>((resolve, reject) => {
					let pages: number[] = options ? options.pages || [] : [];
					let thumbPng = new SlideToPNGConverter().convert(doc, pages, false);
					var zip = new JSZip();
					zip.file("data.hvd", jsonStr);
					zip
						.generateAsync({ type: "uint8array", compression: "DEFLATE" })
						.then((u8a) => {
							this.embedder.embed(thumbPng, u8a, (embeddedPngDataURL: string) => {
								DataUtil.downloadBlob(
									DataUtil.dataURItoBlob(embeddedPngDataURL),
									SlideStorage.PNG_DATA_FILE_PREFIX + doc.title + ".png"
								);
								resolve();
							});
						})
						.catch(() => {
							reject(
								createStorageOperationError(StorageErrorCode.STORAGE_IO_ERROR, "png export failed")
							);
						});
				});
			case HVDataType.HVD:
				let blob = new Blob([jsonStr], { type: "text/plain" });
				DataUtil.downloadBlob(blob, doc.title + ".hvd");
				return Promise.resolve();
			case HVDataType.HVZ:
				return new Promise<void>((resolve, reject) => {
					var zip = new JSZip();
					zip.file(doc.title + ".hvd", jsonStr);
					zip
						.generateAsync({ type: "blob", compression: "DEFLATE" })
						.then((blob) => {
							DataUtil.downloadBlob(blob, doc.title + ".hvz");
							resolve();
						})
						.catch(() => {
							reject(
								createStorageOperationError(StorageErrorCode.STORAGE_IO_ERROR, "hvz export failed")
							);
						});
				});
			default:
				return Promise.reject(
					createStorageOperationError(StorageErrorCode.INVALID_ARGUMENT, "unsupported export type")
				);
		}
	}

	public load(id: string) {
		let title = this.titleById[id];
		if (!title) {
			throw createStorageOperationError(StorageErrorCode.INVALID_ARGUMENT, "load target not found");
		}

		console.log("load at slideStorage", id, title);
		let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.dataStore = transaction.objectStore("slideData");
		let getReq = this.dataStore.get(title);
		getReq.onsuccess = async (e: Event) => {
			try {
				const req = e.target as IDBRequest<{ data: string }>;
				let jsonStr: string = req.result.data;
				this.dispatchEvent(
					new CustomEvent("loaded", { detail: await this.parseData(jsonStr, { title: title }) })
				);
			} catch (error) {
				if (error && typeof error == "object" && "code" in error) {
					const coded = error as { code?: unknown; message?: unknown };
					if (typeof coded.code == "string") {
						this.dispatchStorageError(
							typeof coded.message == "string" ? coded.message : "load parse failed",
							coded.code as StorageErrorCode
						);
						return;
					}
				}

				this.dispatchStorageError("load parse failed", StorageErrorCode.PARSE_ERROR);
			}
		};
		getReq.onerror = async () => {
			this.dispatchStorageError("load request failed", StorageErrorCode.STORAGE_IO_ERROR);
		};
	}

	public async import(file: File) {
		if (file.name.indexOf(".png") != -1) {
			let reader = new FileReader();
			let loadFunc = (reader: FileReader, filePath: File) => {
				return new Promise<void>((resolve) => {
					reader.addEventListener("load", () => {
						resolve();
					});
					reader.readAsDataURL(filePath);
				});
			};

			await loadFunc(reader, file);
			let u8a = this.embedder.extract(reader.result as string);
			let zip = new JSZip();
			await zip.loadAsync(u8a);

			const dataFile = zip.file("data.hvd");
			if (!dataFile) {
				throw createStorageOperationError(
					StorageErrorCode.PARSE_ERROR,
					"embedded data.hvd not found"
				);
			}

			let obj = await dataFile.async("uint8array");
			let jsonStr: string = new TextDecoder().decode(obj);
			if (!jsonStr) {
				throw createStorageOperationError(StorageErrorCode.PARSE_ERROR, "embedded data is empty");
			}
			let title: string = file.name.split(".png")[0].split(SlideStorage.PNG_DATA_FILE_PREFIX)[1];
			this.dispatchEvent(
				new CustomEvent("loaded", { detail: await this.parseData(jsonStr, { title: title }) })
			);
		} else if (file.name.indexOf(".hvz") != -1) {
			let zip = await JSZip.loadAsync(file);
			let targetEntry = Object.values(zip.files).find((entry) => {
				return !entry.dir && entry.name.toLowerCase().indexOf(".hvd") != -1;
			});

			if (!targetEntry) {
				throw createStorageOperationError(
					StorageErrorCode.PARSE_ERROR,
					"import data file not found"
				);
			}

			let data: string = await targetEntry.async("string");
			this.dispatchEvent(new CustomEvent("loaded", { detail: await this.parseData(data) }));
		} else if (file.name.indexOf(".hvd") != -1) {
			let data = await file.text();
			this.dispatchEvent(new CustomEvent("loaded", { detail: await this.parseData(data) }));
		} else {
			throw createStorageOperationError(
				StorageErrorCode.INVALID_ARGUMENT,
				"unsupported import file type"
			);
		}
	}

	public delete(id: string) {
		let title: string = this.titleById[id];
		if (!title) {
			throw createStorageOperationError(
				StorageErrorCode.INVALID_ARGUMENT,
				"delete target not found"
			);
		}

		const numericId = parseInt(id);
		if (isNaN(numericId)) {
			throw createStorageOperationError(
				StorageErrorCode.INVALID_ARGUMENT,
				"delete target id is invalid"
			);
		}

		let transaction = this.db.transaction(["slideTitles", "slideData"], "readwrite");
		this.titleStore = transaction.objectStore("slideTitles");
		this.dataStore = transaction.objectStore("slideData");

		let deleteReq1 = this.titleStore.delete(numericId);
		let deleteReq2 = this.dataStore.delete(title);
		deleteReq1.onerror = (e: any) => {
			this.dispatchStorageError("delete title failed", StorageErrorCode.STORAGE_IO_ERROR);
		};
		deleteReq2.onerror = (e: any) => {
			this.dispatchStorageError("delete data failed", StorageErrorCode.STORAGE_IO_ERROR);
		};
		deleteReq1.onsuccess = (e: any) => {
			this.updateTitleMenu();
		};
	}

	//

	private stringifyData(doc: ViewerDocument): string {
		//console.log("stringifyData start ------------");

		let json: any = {};
		json.version = SlideStorage.VERSION;
		json.screen = { width: doc.width, height: doc.height };

		if (doc.bgColor) json.bgColor = doc.bgColor;
		if (doc.createTime) json.createTime = doc.createTime;
		if (doc.editTime) json.editTime = doc.editTime;

		let slideData: any[] = [];
		let imageData: any = {};

		doc.slides.forEach((slide) => {
			let slideDatum: any = {};
			slideDatum.id = slide.id;
			slideDatum.durationRatio = slide.durationRatio;
			slideDatum.joining = slide.joining;
			slideDatum.disabled = slide.disabled;

			slideDatum.layers = [];
			slide.layers.forEach((layer) => {
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
		options.title = options.title || DateUtil.getDateString();
		options.bgColor = options.bgColor || "#000000";
		options.createTime = options.createTime || new Date().getTime();
		options.editTime = options.editTime || options.createTime;

		let json: any = JSON.parse(jsonStr);

		ImageManager.shared.initialize();

		//ver1
		if (json.version == 1 || json.version == undefined) {
			throw createStorageOperationError(StorageErrorCode.UNSUPPORTED_VERSION, "too old version");
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

			//step calcurate
			let totalSteps = 0;
			let currentStep = 0;

			let imageIds = Object.keys(json.imageData);
			let totalImages = imageIds.length;
			totalSteps += totalImages;

			let totalLayers = json.slideData.reduce((sum, slideDatum) => {
				if (json.version >= 2.1) {
					return sum + slideDatum.layers.length;
				} else {
					return sum + slideDatum.images.length;
				}
			}, 0);
			totalSteps += totalLayers;

			//load images
			for (let i = 0; i < totalImages; i++) {
				let percentage = currentStep++ / totalSteps;
				this.dispatchEvent(new CustomEvent("loading", { detail: percentage }));

				let imageId = imageIds[i];
				if (json.imageData[imageId] == undefined) {
					throw createStorageOperationError(StorageErrorCode.MISSING_ASSET, "missing image asset");
				}
				await ImageManager.shared.registImageData(imageId, json.imageData[imageId]);
			}

			//construct slides
			json.slideData.forEach((slideDatum) => {
				let slide: Slide = createSlide(width, height);
				slide.durationRatio = slideDatum.durationRatio || 1;
				slide.joining = Boolean(slideDatum.joining);
				slide.disabled = Boolean(slideDatum.disabled);

				let layers: any[];
				if (json.version >= 2.1) {
					layers = slideDatum.layers;
				} else {
					layers = slideDatum.images;
				}

				layers.forEach((layerDatum) => {
					let percentage = currentStep++ / totalSteps;
					this.dispatchEvent(new CustomEvent("loading", { detail: percentage }));

					switch (layerDatum.type) {
						case LayerType.TEXT:
							let textLayer = createTextLayer(layerDatum.text, {
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
						case undefined: //version < 2.1
						case LayerType.IMAGE:
							let img: ImageLayer = createImageLayer(layerDatum.imageId, {
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

			this.dispatchEvent(new CustomEvent("loading", { detail: 1 }));

			if (json.bgColor) options.bgColor = json.bgColor;
			if (json.createTime) options.createTime = json.createTime;
			if (json.editTime) options.editTime = json.editTime;

			return createViewerDocument(slides, options);
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
						return a.id > b.id ? 1 : -1;
					} else {
						return a.update > b.update ? 1 : -1;
					}
				});
				// console.log(this.titles)

				this.dispatchEvent(new Event("update"));
			}
		};
	}
}
