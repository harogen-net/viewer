import * as ReactDOM from "react-dom/client";


export namespace ReactRoot {

  const rootDict: { [key: string]: ReactDOM.Root } = {};
  export function getRoot(id: string): ReactDOM.Root {
    if (rootDict[id]) {
      return rootDict[id];
    }
    rootDict[id] = ReactDOM.createRoot(document.getElementById(id)!)
    return rootDict[id];

  }
}