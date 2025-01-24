import { ReactNode, createContext, useState } from "react";
import { RViewerDocument } from "../model/ViewerDocument";

export const DocumentContext = createContext(
	{} as {
		document: RViewerDocument | undefined;
		setDocument: React.Dispatch<React.SetStateAction<RViewerDocument | undefined>>;
	}
);

export const DocumentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [document, setDocument] = useState<RViewerDocument | undefined>(undefined);

	return (
		<DocumentContext.Provider
			value={{
				document,
				setDocument,
			}}>
			{children}
		</DocumentContext.Provider>
	);
};
