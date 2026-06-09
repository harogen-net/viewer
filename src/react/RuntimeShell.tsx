import { Badge, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { FeatureGate } from "../runtime/featureGate";
import { AppRuntimeMode } from "../runtime/mode";

type RuntimeShellProps = {
  mode: AppRuntimeMode;
  gate: FeatureGate;
};

type SlideSnapshot = {
  label: string;
  selected: boolean;
};

export function RuntimeShell({ mode, gate }: RuntimeShellProps) {
  const [slides, setSlides] = useState<SlideSnapshot[]>([]);

  useEffect(() => {
    const collect = () => {
      const nodes = Array.from(document.querySelectorAll(".list .slide"));
      const nextSlides = nodes.map((node, index) => {
        const selected = node.classList.contains("selected");
        return {
          label: `Slide ${index + 1}`,
          selected,
        };
      });
      setSlides(nextSlides);
    };

    collect();

    const container = document.querySelector(".list .container");
    if (!container) {
      return;
    }

    const observer = new MutationObserver(() => {
      collect();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  const modeText = useMemo(() => {
    return mode === "mobile-pwa" ? "mobile-pwa" : "browser";
  }, [mode]);

  return (
    <Paper
      shadow="md"
      p="sm"
      radius="md"
      withBorder
      style={{
        position: "fixed",
        left: 12,
        bottom: 12,
        width: 220,
        zIndex: 2147483646,
        background: "rgba(255, 255, 255, 0.92)",
        backdropFilter: "blur(2px)",
      }}
    >
      <Stack gap={8}>
        <Group justify="space-between" align="center">
          <Text fw={700} size="sm">
            React Shell
          </Text>
          <Badge size="xs" color={mode === "mobile-pwa" ? "orange" : "blue"}>
            {modeText}
          </Badge>
        </Group>

        <Group gap={6}>
          <Badge size="xs" color={gate.canEdit ? "teal" : "gray"}>
            {gate.canEdit ? "editable" : "readonly"}
          </Badge>
          <Badge size="xs" color={gate.canImport ? "cyan" : "gray"}>
            import:{gate.canImport ? "on" : "off"}
          </Badge>
        </Group>

        <Text size="xs" c="dimmed">
          Slide List (React mirror)
        </Text>
        <ScrollArea h={120} type="auto">
          <Stack gap={4}>
            {slides.length === 0 ? (
              <Text size="xs" c="dimmed">
                No slides
              </Text>
            ) : (
              slides.map((slide) => (
                <Text key={slide.label} size="xs" fw={slide.selected ? 700 : 400}>
                  {slide.selected ? "● " : "○ "}
                  {slide.label}
                </Text>
              ))
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}
