import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { FC, ReactNode } from "react";

// 汎用 confirm dialog (v4 Group D D-6a、§0-10 新側内製、Mantine Modal ベース)。
// 今後 image 削除 / レイヤー削除 / 不可逆操作 全般に再利用する。
//
// 設計:
//   - opened/onClose は親が制御 (controlled)
//   - confirm / cancel ボタンの label / color を prop で渡せる
//   - confirm 押下時に onConfirm を呼んで自動的に閉じる (親が再度 onClose を呼ぶ必要なし)
//   - 本文は children でも message でも可 (message を渡したら Text に包んで出す)

export interface ConfirmDialogProps {
	opened: boolean;
	onClose: () => void;
	onConfirm: () => void;
	title: string;
	/** 本文 (テキスト or 任意 ReactNode)。children と排他、両方渡したら children 優先。 */
	message?: string;
	children?: ReactNode;
	/** confirm ボタン label (default: "OK")。 */
	confirmLabel?: string;
	/** cancel ボタン label (default: "キャンセル")。 */
	cancelLabel?: string;
	/** confirm ボタン色 (default: "red" = 危険操作)。 */
	confirmColor?: string;
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
	opened,
	onClose,
	onConfirm,
	title,
	message,
	children,
	confirmLabel = "OK",
	cancelLabel = "キャンセル",
	confirmColor = "red",
}) => {
	const handleConfirm = () => {
		onConfirm();
		onClose();
	};

	return (
		<Modal
			opened={opened}
			onClose={onClose}
			title={title}
			centered
			size="md"
			data-confirm-dialog
		>
			<Stack gap="md">
				{children ?? (message && <Text size="sm">{message}</Text>)}
				<Group justify="flex-end" gap="sm">
					<Button
						variant="default"
						onClick={onClose}
						data-confirm-action="cancel"
					>
						{cancelLabel}
					</Button>
					<Button
						color={confirmColor}
						onClick={handleConfirm}
						data-confirm-action="confirm"
					>
						{confirmLabel}
					</Button>
				</Group>
			</Stack>
		</Modal>
	);
};
