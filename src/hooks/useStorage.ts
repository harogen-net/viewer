import { useCallback, useEffect, useRef, useState } from "react";
import { ViewerDocument } from "../model/ViewerDocument";
import { DateUtil } from "../utils/DateUtil";
import { set } from "rsuite/esm/internals/utils/date";
import { get } from "jquery";

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

  const initializeDB = useCallback(() => {
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
      thumbnailStoreRef.current = transaction.objectStore(THUMBNAIL_STORE_NAME);
      setIsLoading(false);
    };

    useEffect(() => {
      initializeDB();
    }, [initializeDB]);

    dbRequest.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(TITLE_STORE_NAME)) {
        db.createObjectStore(TITLE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
        db.createObjectStore(DATA_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        db.createObjectStore(THUMBNAIL_STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    updateTitles();
  }, []);

  // データの取得
  const updateTitles = useCallback(() => {
    if (!dbRef.current || !titleStoreRef.current) {
      throw new Error("Database is not initialized");
    }
    setIsLoading(true);

    const titleStore = titleStoreRef.current;
    const request = titleStore.getAll();
    let titles: SlideTitle[] = [];
    // let titleById: { [key: number]: string } = {};
    // let idByTitle: { [key: string]: number } = {};

    request.onsuccess = (event) => {
      let cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        let id = parseInt(cursor.value.id);
        let title = cursor.value.title;
        let update = cursor.value.update || 0;

        titles.push({ id: id, title: title, update: update });
        // titleById[id] = title;
        // idByTitle[title] = id;

        cursor.continue();
      } else {
        titles.sort((a, b) => a.update === b.update ? a.id - b.id : a.update - b.update);

        setTitles(titles);
        // setTitleById(titleById);
        // setIdByTitle(idByTitle);

        setIsLoading(false);
      }
    };

    request.onerror = () => {
      setIsLoading(false);
      throw new Error(`Failed to fetch data from store: ${TITLE_STORE_NAME}`);
    };
  }, []);


  const save = (vdoc: ViewerDocument, isOverride: boolean = false) => {
    let title = isOverride ? vdoc.title : DateUtil.getDateString();
    let id = titles.find((t) => t.title === title)?.id;
    if (!id) return;


  }

  const load = async (id: number): Promise<ViewerDocument | undefined> => {
    if (!dataStoreRef.current) {
      throw new Error("Database is not initialized");
    }
    let title = titles.find((t) => t.id === id)?.title;
    if (!title) return;
    console.log("load at slideStorage", id, title)

    return new Promise<ViewerDocument | undefined>((resolve, reject) => {
      let getReq = dataStoreRef.current!.get(title);
      getReq.onsuccess = async (e: any) => {
        let jsonStr: string = e.target.result.data;
        resolve(JSON.parse(jsonStr));
      };
      getReq.onerror = (e: any) => {
        reject(e);
      }
    });
  }

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
  }

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
      }
    });
  }

  return { isLoading, titles, save, load, remove };

};