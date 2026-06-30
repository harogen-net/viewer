import { type AlertChoice, AlertKind, useAlertStore } from "@/state/alertStore";
import { useMemo } from "react";

// window.alert / confirm / prompt の非同期 (Promise) 置換 hook。
// AlertHost (Mantine Modal) が描画・応答する。呼び出し側は await して結果を受ける:
//   await alert.alert("保存しました")            → Promise<void>
//   if (await alert.confirm("削除しますか?")) ... → Promise<boolean>
//   const v = await alert.prompt("名前", "既定")  → Promise<string | null> (キャンセルは null)

export interface AlertOptions {
	title?: string;
	okLabel?: string;
	cancelLabel?: string;
}

export interface UseAlert {
	alert: (message: string, opts?: AlertOptions) => Promise<void>;
	confirm: (message: string, opts?: AlertOptions) => Promise<boolean>;
	prompt: (message: string, defaultValue?: string, opts?: AlertOptions) => Promise<string | null>;
	/**
	 * N 択ダイアログ。選んだ choice.value を返す。X/Esc/overlay での dismiss は null。
	 */
	choice: (
		message: string,
		choices: AlertChoice[],
		opts?: Pick<AlertOptions, "title">
	) => Promise<string | null>;
}

export const useAlert = (): UseAlert =>
	useMemo(() => {
		const setRequest = useAlertStore.getState().setRequest;
		return {
			alert: (message, opts) =>
				new Promise<void>((res) => {
					setRequest({ kind: AlertKind.ALERT, message, ...opts, resolve: () => res() });
				}),
			confirm: (message, opts) =>
				new Promise<boolean>((res) => {
					setRequest({
						kind: AlertKind.CONFIRM,
						message,
						...opts,
						resolve: (v) => res(v === true),
					});
				}),
			prompt: (message, defaultValue = "", opts) =>
				new Promise<string | null>((res) => {
					setRequest({
						kind: AlertKind.PROMPT,
						message,
						defaultValue,
						...opts,
						resolve: (v) => res(typeof v === "string" ? v : null),
					});
				}),
			choice: (message, choices, opts) =>
				new Promise<string | null>((res) => {
					setRequest({
						kind: AlertKind.CHOICE,
						message,
						choices,
						...opts,
						resolve: (v) => res(typeof v === "string" ? v : null),
					});
				}),
		};
	}, []);
