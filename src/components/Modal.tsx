import { useEffect, useRef, useState } from "react";
import { ModalType, useModal } from "../hooks/useModal";
import {
	Modal as FModal,
	Text,
	ButtonToolbar,
	Button,
	RadioGroup,
	Radio,
	Placeholder,
	Input,
} from "rsuite";

export const Modal: React.FC = () => {
	//context
	const { modalConfig } = useModal();

	//state
	const [isShow, setIsShow] = useState(false);
	const [text, setText] = useState("");
	const [composing, setComposition] = useState(false); //日本語変換中かどうかのフラグ

	//effect
	useEffect(() => {
    console.log(modalConfig)

		input.current?.focus();
		if (modalConfig) {
			setIsShow(true);

			if (modalConfig.type == ModalType.PROMPT) {
				setText(modalConfig.inputText || "");
			}
		}
	}, [modalConfig]);

	//ref
	const input = useRef<HTMLInputElement>(null);

	const startComposition = () => setComposition(true);
	const endComposition = () => setComposition(false);
	const hide = () => {
		if (modalConfig?.onHide) {
			modalConfig.onHide();
		}
		if (modalConfig) {
			setIsShow(false);
		}
		// setModal(undefined);
	};

	return (
		<>
			{modalConfig && (
				<FModal open={isShow} onClose={hide} className="">
					<FModal.Header>{modalConfig.title}</FModal.Header>
					<FModal.Body>
						<div className="space-y-6" style={{ whiteSpace: "pre-wrap" }}>
							<p className="text-base leading-relaxed text-gray-500 dark:text-gray-400">
								{modalConfig.text}
							</p>
						</div>
						{modalConfig.type == ModalType.PROMPT && (
							<>
								<div className="mt-4 mb-3">
									<Text>{modalConfig.inputTitle}</Text>
									<Input
										ref={input}
										type="text"
										color={modalConfig.isDangerous ? "failure" : "primary"}
										autoFocus
										placeholder={modalConfig.inputPlaceholder}
										value={text}
										onChange={(e: any) => setText(e.target.value)}
										onCompositionStart={startComposition}
										onCompositionEnd={endComposition}
										onKeyDown={(e) => {
											if (e.key != "Enter") return;
											if (composing) return;
											e.preventDefault();
											e.stopPropagation();
											let text = (input.current?.value || "").trim();
											if (text === undefined || text === "") return;
											if (modalConfig.validate && !modalConfig.validate(text)) return;
											console.log(text);
											if (modalConfig.onSubmit) {
												modalConfig.onSubmit(text!);
											}
											hide();
										}}
									/>
								</div>
							</>
						)}
					</FModal.Body>
					<FModal.Footer>
						{(!modalConfig.type || modalConfig.type == ModalType.ALERT) && (
							<>
								<Button
									// color={modalConfig.isDangerous ? "failure" : "primary"}
									onClick={hide}>
									{modalConfig.submitIcon && (
										<modalConfig.submitIcon className="mr-2 w-[20px] h-[20px]"></modalConfig.submitIcon>
									)}
									{modalConfig.submitText || "OK"}
								</Button>
							</>
						)}
						{modalConfig.type == ModalType.CONFIRM && (
							<>
								<Button
									// color="outlined"
									onClick={hide}>
									{modalConfig.cancelText || "キャンセル"}
								</Button>
								<Button
									// color={modalConfig.isDangerous ? "failure" : "primary"}
									onClick={() => {
										if (modalConfig.onSubmit) {
											modalConfig.onSubmit();
										}
										hide();
									}}>
									{modalConfig.submitIcon && (
										<modalConfig.submitIcon className="mr-2 w-[20px] h-[20px]"></modalConfig.submitIcon>
									)}
									{modalConfig.submitText || "OK"}
								</Button>
							</>
						)}
						{modalConfig.type == ModalType.PROMPT && (
							<>
								<Button
									// color="outlined"
									onClick={hide}>
									{modalConfig.cancelText || "キャンセル"}
								</Button>
								<Button
									// color={modalConfig.isDangerous ? "failure" : "primary"}
									disabled={
										modalConfig.validate
											? !modalConfig.validate(text.trim()) || text.trim() === ""
											: text.trim() === ""
									}
									onClick={() => {
										let text = (input.current?.value || "").trim();
										if (text === undefined || text === "") return;
										if (modalConfig.validate && !modalConfig.validate(text)) return;
										console.log(text);
										if (modalConfig.onSubmit) {
											modalConfig.onSubmit(text!);
										}
										hide();
									}}>
									{modalConfig.submitIcon && (
										<modalConfig.submitIcon className="mr-2 w-[20px] h-[20px]"></modalConfig.submitIcon>
									)}
									{modalConfig.submitText || "OK"}
								</Button>
							</>
						)}
					</FModal.Footer>
				</FModal>
			)}
		</>
	);
};
