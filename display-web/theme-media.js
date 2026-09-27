(function () {
  // Keep media outside the scene HTML: polling, resizing and pagination must not
  // restart a decoder or apply the scene's entrance animation to its background.
  function create(root) {
    const media = document.createElement("div");
    media.className = "theme-media-host";
    media.setAttribute("aria-hidden", "true");
    const content = document.createElement("div");
    content.className = "theme-scene-host";
    root.replaceChildren(media, content);
    const layers = new Map();

    function render(html, background = "") {
      const template = document.createElement("template");
      template.innerHTML = html;
      if (!template.content.querySelector(".idle-screen, .theme-art-background") && background) {
        const backdrop = document.createElement("template");
        backdrop.innerHTML = background;
        template.content.querySelector(".screen")?.prepend(backdrop.content);
      }
      const wanted = new Set();
      for (const art of template.content.querySelectorAll(".theme-art")) {
        const source = art.querySelector("video, img");
        if (!source) continue;
        const key = art.className + "|" + source.tagName + "|" + source.getAttribute("src");
        wanted.add(key);
        if (!layers.has(key)) {
          const video = source.tagName === "VIDEO";
          const layer = video ? createVideo(art, source) : { element: art, dispose() { art.remove(); } };
          layers.set(key, layer);
          media.appendChild(art);
        }
        // An existing layer stays attached; only the inert placeholder is removed.
        if (art.parentNode !== media) art.remove();
      }
      for (const [key, layer] of layers) {
        if (!wanted.has(key)) { layer.dispose(); layers.delete(key); }
      }
      root.classList.toggle("theme-idle-scene", Boolean(template.content.querySelector(".idle-screen")));
      content.replaceChildren(template.content);
    }

    function dispose() {
      for (const layer of layers.values()) layer.dispose();
      layers.clear();
    }
    window.addEventListener("pagehide", event => { if (!event.persisted) dispose(); });
    return { render, dispose };
  }

  function createVideo(element, video) {
    element.classList.add("theme-video-layer");
    video.loop = false;
    video.removeAttribute("loop");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    const hold = document.createElement("canvas");
    hold.className = "theme-video-hold";
    hold.style.opacity = "0";
    element.appendChild(hold);
    let disposed = false, rewinding = false, fadeStarted = null, frame = 0, decodedFrame = 0;
    const FADE_MS = 180;

    function play() {
      if (!disposed && !document.hidden) video.play()?.catch(() => {});
    }
    function schedule() {
      if (!frame && !disposed && !document.hidden) frame = requestAnimationFrame(tick);
    }
    function decoded(_now, metadata) {
      decodedFrame = 0;
      if (disposed || !rewinding || fadeStarted !== null) return;
      if (video.seeking || (metadata && metadata.mediaTime > Math.min(0.3, video.duration / 2))) {
        if (video.requestVideoFrameCallback) decodedFrame = video.requestVideoFrameCallback(decoded);
        return;
      }
      // Keep the held image until the restarted video has a decoded frame.
      fadeStarted = performance.now();
      schedule();
    }
    function rewind() {
      if (disposed || rewinding || video.readyState < 2 || !video.videoWidth) return;
      try {
        if (hold.width !== video.videoWidth || hold.height !== video.videoHeight) {
          hold.width = video.videoWidth; hold.height = video.videoHeight;
        }
        const context = hold.getContext("2d");
        context.clearRect(0, 0, hold.width, hold.height);
        context.drawImage(video, 0, 0, hold.width, hold.height);
      } catch (_) {
        // If this device cannot allocate a frame buffer, retain native looping.
        video.loop = true;
        play();
        return;
      }
      hold.style.opacity = "1";
      rewinding = true;
      fadeStarted = null;
      video.currentTime = 0;
      if (video.requestVideoFrameCallback) decodedFrame = video.requestVideoFrameCallback(decoded);
      play();
      schedule();
    }
    function tick(now) {
      frame = 0;
      if (disposed || document.hidden) return;
      if (rewinding) {
        // Older browsers: seeked plus an advancing currentTime means playback
        // has resumed; wait for that instead of exposing an empty decoder.
        if (!video.requestVideoFrameCallback && !video.seeking && video.readyState >= 2 && video.currentTime > 0) decoded();
        if (fadeStarted !== null) {
          const fadeMs = Number.isFinite(video.duration) ? Math.min(FADE_MS, video.duration * 250) : FADE_MS;
          const progress = Math.min(1, (now - fadeStarted) / fadeMs);
          hold.style.opacity = String(1 - Math.max(0, progress));
          if (progress >= 1) { rewinding = false; fadeStarted = null; }
        }
      }
      if (!rewinding && !video.loop && (video.ended || (Number.isFinite(video.duration)
          && video.duration > 0.25 && video.duration - video.currentTime <= 0.05))) rewind();
      if (!video.paused || rewinding) schedule();
    }
    function visibility() {
      if (document.hidden) { video.pause(); cancelAnimationFrame(frame); frame = 0; }
      else { play(); schedule(); }
    }
    video.addEventListener("playing", schedule);
    video.addEventListener("ended", rewind);
    document.addEventListener("visibilitychange", visibility);
    play();
    schedule();
    return {
      element,
      dispose() {
        disposed = true;
        cancelAnimationFrame(frame);
        if (decodedFrame) video.cancelVideoFrameCallback(decodedFrame);
        document.removeEventListener("visibilitychange", visibility);
        video.removeEventListener("playing", schedule);
        video.removeEventListener("ended", rewind);
        video.pause();
        video.removeAttribute("src");
        video.load();
        hold.width = hold.height = 0;
        element.remove();
      },
    };
  }
  window.GTThemeMedia = { create };
})();
