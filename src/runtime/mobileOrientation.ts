export function setUpMobileLandscapeFallback(wrapper: HTMLElement | null): void {
  if (!wrapper) return;

  tryLockLandscape();

  const applyLayout = () => {
    const isPortrait = window.innerHeight > window.innerWidth;

    if (!isPortrait) {
      resetForcedLandscape(wrapper);
      return;
    }

    document.body.classList.add("forced-landscape");

    wrapper.style.position = "absolute";
    wrapper.style.left = "50%";
    wrapper.style.top = "50%";
    wrapper.style.width = `${window.innerHeight}px`;
    wrapper.style.height = `${window.innerWidth}px`;
    wrapper.style.transform = "translate(-50%, -50%) rotate(90deg)";
    wrapper.style.transformOrigin = "center center";
  };

  window.addEventListener("resize", applyLayout);
  window.addEventListener("orientationchange", applyLayout);
  applyLayout();
}

function resetForcedLandscape(wrapper: HTMLElement) {
  document.body.classList.remove("forced-landscape");
  wrapper.style.position = "";
  wrapper.style.left = "";
  wrapper.style.top = "";
  wrapper.style.width = "";
  wrapper.style.height = "";
  wrapper.style.transform = "";
  wrapper.style.transformOrigin = "";
}

function tryLockLandscape() {
  try {
    const orientation = window.screen.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;

    orientation.lock("landscape").catch(() => {
      // Fallback is applied via transform in setUpMobileLandscapeFallback.
    });
  } catch (e) {
    // Ignore unsupported orientation lock.
  }
}
