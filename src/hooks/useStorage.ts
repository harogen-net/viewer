import { useCallback, useEffect, useRef, useState } from "react";
import { RViewerDocument } from "../model/ViewerDocument";
import { DateUtil } from "../utils/DateUtil";
import { set } from "rsuite/esm/internals/utils/date";
import { get } from "jquery";
import { SlideStorage } from "../utils/SlideStorage";
import { RSlide } from "../model/Slide";
import { ImageManager } from "../utils/ImageManager";
import { Viewer } from "../Viewer";
import { LayerType } from "../model/Layer";
import { RTextLayer } from "../model/layer/TextLayer";
import { parse } from "path";

export interface SlideTitle {
	id: number;
	title: string;
	update: number;
}

export const useStorage = () => {
	const SAVE_KEY: string = "viewer.slideData";
	const DB_NAME: string = "viewer";
	const TITLE_STORE_NAME: string = "slideTitles";
	const DATA_STORE_NAME: string = "slideData";
	const THUMBNAIL_STORE_NAME: string = "slideThumbnails";
	const PND_DATA_FILE_PREFIX: string = "[hv]";

	const [isLoading, setIsLoading] = useState(true);
	const [titles, setTitles] = useState<SlideTitle[]>([]);

	// IDBDatabase と IDBObjectStore を保持するための ref
	const dbRef = useRef<IDBDatabase | undefined>(undefined);
	const titleStoreRef = useRef<IDBObjectStore | undefined>(undefined);
	const dataStoreRef = useRef<IDBObjectStore | undefined>(undefined);
	const thumbnailStoreRef = useRef<IDBObjectStore | undefined>(undefined);

	const initializeDB = useCallback((callback: () => void) => {
		const dbRequest = indexedDB.open(DB_NAME);

		dbRequest.onerror = () => {
			// setError(new Error(`Failed to open database: ${DB_NAME}`));
			throw new Error(`Failed to open database: ${DB_NAME}`);
			setIsLoading(false);
		};

		dbRequest.onsuccess = () => {
			const db = dbRequest.result;
			dbRef.current = db;
			const transaction = db.transaction([TITLE_STORE_NAME, DATA_STORE_NAME], "readwrite");
			titleStoreRef.current = transaction.objectStore(TITLE_STORE_NAME);
			dataStoreRef.current = transaction.objectStore(DATA_STORE_NAME);
			// thumbnailStoreRef.current = transaction.objectStore(THUMBNAIL_STORE_NAME);
			setIsLoading(false);
			callback();
		};

		dbRequest.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains(TITLE_STORE_NAME)) {
				db.createObjectStore(TITLE_STORE_NAME, { keyPath: "id", autoIncrement: true });
			}
			if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
				db.createObjectStore(DATA_STORE_NAME, { keyPath: "id", autoIncrement: true });
			}
			if (!db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
				db.createObjectStore(THUMBNAIL_STORE_NAME, { keyPath: "id", autoIncrement: true });
			}
		};
	}, []);

	// データの取得
	const updateTitles = useCallback(() => {
		if (!dbRef.current || !titleStoreRef.current) {
			throw new Error("Database is not initialized");
		}
		setIsLoading(true);

		try {
			const titleStore = titleStoreRef.current;
			const request = titleStore.getAll();
			request.onsuccess = (event) => {
				const result = (event.target as IDBRequest<SlideTitle[]>).result;
				if (Array.isArray(result)) {
					// ✅ データの存在チェックを厳密に
					const sortedTitles = [...result].sort((a, b) =>
						a.update === b.update ? a.id - b.id : a.update - b.update
					);
					setTitles(sortedTitles);
				}
				setIsLoading(false);
			};

			request.onerror = () => {
				setIsLoading(false);
				throw new Error(`Failed to fetch data from store: ${TITLE_STORE_NAME}`);
			};
		} catch (e) {
			console.error("Unexpected error in updateTitles:", e);
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		initializeDB(() => {
			console.log("initializeDB");
			updateTitles();
		});
	}, [initializeDB]);

	const save = (vdoc: RViewerDocument, isOverride: boolean = false) => {
		let title = isOverride ? vdoc.title : DateUtil.getDateString();
		let id = titles.find((t) => t.title === title)?.id;
		if (!id) return;
	};

	const load = async (id: number): Promise<RViewerDocument | undefined> => {
		if (!dbRef.current) {
			throw new Error("Database is not initialized");
		}

		const title = titles.find((t) => t.id === id)?.title;
		if (!title) return undefined;

		return new Promise<RViewerDocument | undefined>((resolve, reject) => {
			try {
				const tx = dbRef.current!.transaction(DATA_STORE_NAME, "readonly"); // ✅ トランザクションを明示的に作成
				const store = tx.objectStore(DATA_STORE_NAME);
				const getReq = store.get(title);

				getReq.onsuccess = async (e: any) => {
					try {
						const jsonStr: string = e.target.result?.data;
						if (jsonStr === undefined) {
							resolve(undefined);
							return;
						}

            const parsedData: RViewerDocument = JSON.parse(jsonStr);
            console.log(parsedData);

						const document: RViewerDocument = await RViewerDocument.parse(jsonStr);
						resolve(document);
					} catch (error) {
						reject(error);
					}
				};

				getReq.onerror = (e: any) => {
					reject(e);
				};
			} catch (error) {
				reject(error);
			}
		});
	};

	const remove = (id: number) => {
		if (!titleStoreRef.current || !dataStoreRef.current) {
			throw new Error("Database is not initialized");
		}

		let title = titles.find((t) => t.id === id)?.title;
		if (!title) return;

		let titleStore = titleStoreRef.current;
		let dataStore = dataStoreRef.current;

		let deleteTitleReq = titleStore.delete(id);
		deleteTitleReq.onsuccess = () => {
			console.log("delete title", id, title);
			updateTitles();
		};

		let deleteDataReq = dataStore.delete(title);
		deleteDataReq.onsuccess = () => {
			console.log("delete data", title);
		};
	};

	const getThumbnail = async (id: number): Promise<string | undefined> => {
		if (!thumbnailStoreRef.current) {
			throw new Error("Database is not initialized");
		}

		let title = titles.find((t) => t.id === id)?.title;
		if (!title) return;

		return new Promise<string | undefined>((resolve, _) => {
			let getReq = thumbnailStoreRef.current!.get(title);
			getReq.onsuccess = async (e: any) => {
				let blob = e.target.result.data;
				let reader = new FileReader();
				reader.onloadend = () => {
					resolve(reader.result as string);
				};
				reader.onerror = (e) => {
					resolve(undefined);
				};
				reader.readAsDataURL(blob);
			};
			getReq.onerror = (e: any) => {
				resolve(undefined);
			};
		});
	};

	return { isLoading, titles, save, load, remove };
};
