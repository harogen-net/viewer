import { useContext } from "react";
import { ModalContext } from "../provider/ModalProvider";

export const ModalType = {
	ALERT: "alert",
	CONFIRM: "confirm",
	PROMPT: "prompt",
} as const;
export type ModalType = (typeof ModalType)[keyof typeof ModalType];

export type ModalConfig = {
	type?: ModalType;
	isDangerous?: boolean;
	title: string;
	text: string;
	inputTitle?: string;
	inputText?: string;
	inputPlaceholder?: string;
	submitText?: string;
	submitIcon?: React.FC<{ className?: string }>;
	cancelText?: string;
	validate?: (text: string) => boolean;
	onSubmit?: (text?: string) => void;
	onHide?: () => void;
};

export const useModal = () => {
	const context = useContext(ModalContext);
	if (!context) {
		throw new Error("useModal must be used within a ModalProvider");
	}
	return context;
};
