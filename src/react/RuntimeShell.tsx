import { Badge, Button, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FeatureGate } from "../runtime/featureGate";
import { AppRuntimeMode } from "../runtime/mode";

type RuntimeShellProps = {
	mode: AppRuntimeMode;
	gate: FeatureGate;
};

type SlideSnapshot = {
	index: number;
	label: string;
	selected: boolean;
};

export function RuntimeShell({ mode, gate }: RuntimeShellProps) {
	const [slides, setSlides] = useState<SlideSnapshot[]>([]);

	const collectSlides = useCallback(() => {
		const nodes = Array.from(document.querySelectorAll(".list .slide"));
		const nextSlides = nodes.map((node, index) => {
			const selected = node.classList.contains("selected");
			return {
				index,
				label: `Slide ${index + 1}`,
				selected,
			};
		});
		setSlides(nextSlides);
	}, []);

	useEffect(() => {
		collectSlides();

		const observer = new MutationObserver(() => {
			collectSlides();
		});

		observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => {
			observer.disconnect();
		};
	}, [collectSlides]);

	const selectedSlide = useMemo(() => {
		return slides.find((slide) => slide.selected) || null;
	}, [slides]);

	const clickNode = useCallback((selector: string) => {
		const node = document.querySelector(selector) as HTMLElement | null;
		if (!node) {
			return false;
		}
		node.click();
		collectSlides();
		return true;
	}, [collectSlides]);

	const selectSlide = useCallback((index: number) => {
		const nodes = Array.from(document.querySelectorAll(".list .slide"));
		const target = nodes[index] as HTMLElement | undefined;
		if (!target) {
			return;
		}
		target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		target.click();
		collectSlides();
	}, [collectSlides]);

	const cloneSelected = useCallback(() => {
		const node = document.querySelector(".list .slide.selected .clone") as HTMLElement | null;
		if (!node) {
			return;
		}
		node.click();
		collectSlides();
	}, [collectSlides]);

	const deleteSelected = useCallback(() => {
		const node = document.querySelector(".list .slide.selected .delete") as HTMLElement | null;
		if (!node) {
			return;
		}
		node.click();
		collectSlides();
	}, [collectSlides]);

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
				right: 12,
				top: 12,
				width: 280,
				zIndex: 2147483646,
				background: "rgba(255, 255, 255, 0.92)",
				backdropFilter: "blur(2px)",
			}}>
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
					Slide List (React control)
				</Text>
				<Group grow>
					<Button size="xs" variant="light" onClick={() => clickNode(".list .newSlideBtn")} disabled={!gate.canEdit}>
						New
					</Button>
					<Button size="xs" variant="light" onClick={cloneSelected} disabled={!gate.canEdit || !selectedSlide}>
						Clone
					</Button>
					<Button size="xs" color="red" variant="light" onClick={deleteSelected} disabled={!gate.canEdit || !selectedSlide}>
						Delete
					</Button>
				</Group>
				<Group grow>
					<Button size="xs" variant="default" onClick={() => clickNode(".selectSlideBtn.prev")}>Prev</Button>
					<Button size="xs" variant="default" onClick={() => clickNode(".selectSlideBtn.next")}>Next</Button>
				</Group>
				<ScrollArea h={120} type="auto">
					<Stack gap={4}>
						{slides.length === 0 ? (
							<Text size="xs" c="dimmed">
								No slides
							</Text>
						) : (
							slides.map((slide) => (
								<Text
									key={slide.label}
									size="xs"
									fw={slide.selected ? 700 : 400}
									style={{ cursor: "pointer" }}
									onClick={() => selectSlide(slide.index)}>
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
