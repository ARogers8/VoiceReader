// Turns a chunk of text into audio using a neural text-to-speech service.

const NARRATOR_STYLE =
  "Read this like a calm, warm audiobook narrator. Use natural phrasing and " +
  "pauses at commas and sentence ends, and let the pace breathe.";

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n)));

export async function synthesize(settings, text, { previousText, nextText } = {}) {
  if (settings.provider === "elevenlabs") {
    if (!settings.elevenlabsKey) throw new Error("Add your ElevenLabs API key in VoiceReader settings.");
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(settings.elevenlabsVoiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": settings.elevenlabsKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          // Neighbouring text lets the voice carry intonation across chunks.
          previous_text: previousText || undefined,
          next_text: nextText || undefined,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: clamp(settings.rate, 0.7, 1.2),
          },
        }),
      },
    );
    return checkAudio(res, "ElevenLabs");
  }

  if (settings.provider === "openai") {
    if (!settings.openaiKey) throw new Error("Add your OpenAI API key in VoiceReader settings.");
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: settings.openaiVoice,
        input: text,
        instructions: NARRATOR_STYLE,
        speed: clamp(settings.rate, 0.25, 4),
        response_format: "mp3",
      }),
    });
    return checkAudio(res, "OpenAI");
  }

  throw new Error(`Unknown voice provider: ${settings.provider}`);
}

async function checkAudio(res, service) {
  if (res.ok) return res.blob();
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.detail?.message || body?.detail?.status || body?.error?.message || "";
  } catch {}
  if (res.status === 401) detail ||= "the API key was rejected";
  throw new Error(`${service} error ${res.status}${detail ? `: ${detail}` : ""}`);
}

// Neural voices sound best with whole paragraphs, so text is split on
// paragraph breaks and only long paragraphs are split further, at sentence
// ends. Fewer, larger chunks mean fewer audible seams.
export function splitForNarration(text, max = 1200) {
  const paragraphs = text
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";
  const push = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > max) {
      push();
      const sentences = paragraph.match(/[^.!?。！？]+[.!?。！？]*["'”’)\]]*\s*/g) || [paragraph];
      for (const sentence of sentences) {
        if (current && (current + sentence).length > max) push();
        current += sentence;
      }
      current = current.trim();
      push();
    } else if (current && (current + "\n\n" + paragraph).length > max) {
      push();
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  push();
  return chunks;
}
