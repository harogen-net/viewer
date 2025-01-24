import { useContext, useState } from "react";
import { DocumentContext } from "../provider/DocumentProvider";

export const useDocument = () => {
	const context = useContext(DocumentContext);
	if (!context) {
		throw new Error("useDocument must be used within a DocumentProvider");
	}
	return context;
};
