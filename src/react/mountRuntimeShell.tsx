import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import { createRoot } from "react-dom/client";
import { FeatureGate } from "../runtime/featureGate";
import { AppRuntimeMode } from "../runtime/mode";
import { RuntimeShell } from "./RuntimeShell";

type MountRuntimeShellOptions = {
  mode: AppRuntimeMode;
  gate: FeatureGate;
};

const theme = createTheme({
  primaryColor: "blue",
  fontFamily: "Helvetica Neue, Arial, sans-serif",
});

export function mountRuntimeShell(options: MountRuntimeShellOptions) {
  const hostId = "react-runtime-shell";
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement("div");
    host.id = hostId;
    document.body.appendChild(host);
  }

  const root = createRoot(host);
  root.render(
    <MantineProvider theme={theme} defaultColorScheme="light">
      <RuntimeShell mode={options.mode} gate={options.gate} />
    </MantineProvider>
  );
}
