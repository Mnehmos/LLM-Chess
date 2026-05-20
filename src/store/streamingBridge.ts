const STREAM_UPDATE_INTERVAL_MS = 125;
const MAX_STREAMING_DISPLAY_CHARS = 12000;
const STREAM_TRUNCATED_PREFIX = '[stream truncated]\n';

function mergeStreamingText(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (!previous) return incoming;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  return previous + incoming;
}

function clampStreamingText(text: string): string {
  if (text.length <= MAX_STREAMING_DISPLAY_CHARS) return text;
  return STREAM_TRUNCATED_PREFIX + text.slice(-MAX_STREAMING_DISPLAY_CHARS);
}

export function createStreamingBridge(
  apply: (text: string, model: string) => void,
): {
  push: (text: string, model: string) => void;
  dispose: () => void;
} {
  let displayedText = '';
  let displayedModel = '';
  let pendingText = '';
  let pendingModel = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (!pendingText) return;
    displayedText = clampStreamingText(mergeStreamingText(displayedText, pendingText));
    displayedModel = pendingModel || displayedModel;
    pendingText = '';
    pendingModel = '';
    apply(displayedText, displayedModel);
  };

  return {
    push(text: string, model: string) {
      if (!text) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        displayedText = '';
        displayedModel = '';
        pendingText = '';
        pendingModel = '';
        apply('', '');
        return;
      }

      if (displayedModel && model && displayedModel !== model) {
        displayedText = '';
        pendingText = '';
      }

      pendingText = clampStreamingText(mergeStreamingText(pendingText, text));
      pendingModel = model;
      if (!timer) {
        timer = setTimeout(flush, STREAM_UPDATE_INTERVAL_MS);
      }
    },
    dispose() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      displayedText = '';
      displayedModel = '';
      pendingText = '';
      pendingModel = '';
    },
  };
}
