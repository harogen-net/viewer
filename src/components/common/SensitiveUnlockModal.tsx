import { useSensitiveSessionStore } from "@/state/sensitiveSessionStore";
import { Button, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import type { FC } from "react";
import { useEffect, useState } from "react";

// センシティブ文書の解錠パスワード入力モーダル (Phase 3)。AppShell に 1 つマウントする。
// useSensitivePassword が積んだ sensitiveSessionStore.request を描画し、
// 解錠(入力値で resolve) / キャンセル(null で resolve) する。PasswordInput は表示/非表示トグル内蔵。

export const SensitiveUnlockModal: FC = () => {
	const request = useSensitiveSessionStore((s) => s.request);
	const clearRequest = useSensitiveSessionStore((s) => s.clearRequest);
	const [value, setValue] = useState("");

	// 表示のたびに入力欄を空へ (前回入力を残さない)。
	useEffect(() => {
		if (request) setValue("");
	}, [request]);

	const settle = (password: string | null): void => {
		request?.resolve(password);
		clearRequest();
	};

	// 保存/出力時 (encrypt) と 読込時 (unlock) で文言を出し分ける。
	const encrypt = request?.purpose === "encrypt";
	const title = encrypt ? "パスワードの設定" : "センシティブ文書の解錠";
	const message = encrypt
		? "画像を暗号化するためのパスワードを入力してください。（このセッション中は再入力不要）"
		: "この文書は保護されています。画像を表示するにはパスワードを入力してください。";
	const okLabel = encrypt ? "設定" : "解錠";

	return (
		<Modal
			opened={request !== null}
			onClose={() => settle(null)}
			title={title}
			centered
			transitionProps={{ duration: 0 }}
			data-sensitive-unlock
			data-sensitive-purpose={request?.purpose}>
			<Stack gap="md">
				<Text size="sm">{message}</Text>
				{request?.error && (
					<Text size="sm" c="red" data-sensitive-error>
						{request.error}
					</Text>
				)}
				<PasswordInput
					value={value}
					onChange={(e) => setValue(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && value) settle(value);
					}}
					// biome-ignore lint/a11y/noAutofocus: 解錠モーダルは入力へ即フォーカスしたい
					autoFocus
					data-sensitive-input
				/>
				<Group justify="flex-end" gap="sm">
					<Button variant="default" onClick={() => settle(null)} data-sensitive-cancel>
						キャンセル
					</Button>
					<Button onClick={() => settle(value)} disabled={!value} data-sensitive-ok>
						{okLabel}
					</Button>
				</Group>
			</Stack>
		</Modal>
	);
};
