import { Progress } from "@mantine/core";
import { useViewerDocumentStore } from "../state/viewerDocumentStore";

export const ProgressBar = () => {
	const progress = useViewerDocumentStore((s) => s.progress);
	if (progress === null || progress >= 1) return null;
	return <Progress value={progress * 100} />;
};
