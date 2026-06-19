import { MantineProvider } from "@mantine/core";
import type { FC } from "react";
import { ProgressBar } from "./ProgressBar";

export const AppShell: FC = () => (
	<MantineProvider>
		<ProgressBar />
	</MantineProvider>
);
