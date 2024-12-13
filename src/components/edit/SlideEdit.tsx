import { RSlide } from "../../model/Slide";
import { ViewerMode } from "../../Viewer";

export const SlideEdit: React.FC<{
	selectedSlide: RSlide | undefined;
	setMode: React.Dispatch<React.SetStateAction<ViewerMode>>;
}> = ({ selectedSlide, setMode }) => {
	return (
		<div>
			<h1>Slide Edit</h1>
		</div>
	);
};
