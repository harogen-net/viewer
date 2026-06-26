import { Button, Group, Modal, Stack, Text, TextInput } from "@mantine/core";
import type { FC } from "react";
import { useEffect, useState } from "react";
import { AlertKind, useAlertStore } from "../../state/alertStore";

// 汎用モーダル描画ホスト (alert / confirm / prompt)。AppShell に 1 つだけマウントする。
// useAlert が積んだ alertStore.request を Mantine Modal で描画し、OK/キャンセルで resolve する。
//   - alert  : OK のみ → resolve(null)
//   - confirm: OK → resolve(true) / キャンセル(X/Esc/ボタン) → resolve(false)
//   - prompt : OK → resolve(入力文字列) / キャンセル → resolve(null)

export const AlertHost: FC = () => {
	const request = useAlertStore((s) => s.request);
	const clear = useAlertStore((s) => s.clear);
	const [value, setValue] = useState("");

	// prompt 表示開始時に入力欄を初期値へ。
	useEffect(() => {
		if (request?.kind === AlertKind.PROMPT) setValue(request.defaultValue ?? "");
	}, [request]);

	const opened = request !== null;
	const kind = request?.kind ?? AlertKind.ALERT;

	const settle = (result: boolean | string | null) => {
		request?.resolve(result);
		clear();
	};
	// OK: confirm→true / prompt→入力値 / alert→null
	const handleOk = () =>
		settle(kind === AlertKind.CONFIRM ? true : kind === AlertKind.PROMPT ? value : null);
	// キャンセル (X / Esc / overlay / Cancel ボタン): confirm→false / prompt→null / alert→null
	const handleCancel = () => settle(kind === AlertKind.CONFIRM ? false : null);

	return (
		<Modal
			opened={opened}
			onClose={handleCancel}
			title={request?.title}
			centered
			withCloseButton={kind !== AlertKind.ALERT}
			transitionProps={{ duration: 0 }}
			data-alert-host>
			<Stack gap="md">
				<Text size="sm" style={{ whiteSpace: "pre-wrap" }} data-alert-message>
					{request?.message}
				</Text>
				{kind === AlertKind.PROMPT && (
					// biome-ignore lint/a11y/noAutofocus: モーダル prompt は入力に即フォーカスしたい
					<TextInput
						value={value}
						onChange={(e) => setValue(e.currentTarget.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleOk();
						}}
						autoFocus
						data-alert-input
					/>
				)}
				<Group justify="flex-end" gap="sm">
					{kind === AlertKind.CHOICE ? (
						// N 択: 各選択肢を value で resolve するボタンに。dismiss (X/Esc) は null。
						request?.choices?.map((c) => (
							<Button
								key={c.value}
								variant="default"
								onClick={() => settle(c.value)}
								data-alert-choice={c.value}>
								{c.label}
							</Button>
						))
					) : (
						<>
							{kind !== AlertKind.ALERT && (
								<Button variant="default" onClick={handleCancel} data-alert-cancel>
									{request?.cancelLabel ?? "キャンセル"}
								</Button>
							)}
							<Button onClick={handleOk} data-alert-ok>
								{request?.okLabel ?? "OK"}
							</Button>
						</>
					)}
				</Group>
			</Stack>
		</Modal>
	);
};
