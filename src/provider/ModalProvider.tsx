import { ReactNode, createContext, useState } from "react";
import { ModalConfig, useModal } from "../hooks/useModal";
import { Modal } from "../components/Modal";

export const ModalContext = createContext(
	{} as {
		modalConfig: ModalConfig | undefined;
		setModalConfig: React.Dispatch<React.SetStateAction<ModalConfig | undefined>>;
	}
);

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
	const [modalConfig, setModalConfig] = useState<ModalConfig | undefined>(undefined);

	return (
		<ModalContext.Provider
			value={{
				modalConfig,
				setModalConfig,
			}}>
			{children}
			<Modal />
		</ModalContext.Provider>
	);
};
