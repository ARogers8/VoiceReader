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

// Neural voices only return audio once a whole chunk is generated, so a big
// first chunk means a long silence before reading starts. The first chunk is
// kept to a sentence or two and each later chunk may be twice as long (up to
// max), so audio starts quickly and later chunks are generated while earlier
// ones play. Chunks break at sentence ends and keep paragraph breaks.
export function splitForNarration(text, { first = 220, max = 1200 } = {}) {
  const sentences = [];
  for (const paragraph of text.split(/\n\s*\n|\r\n\s*\r\n/)) {
    const clean = paragraph.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    const parts = clean.match(/[^.!?。！？]+[.!?。！？]*["'”’)\]]*\s*/g) || [clean];
    parts.map((p) => p.trim()).filter(Boolean).forEach((sentence, i) => {
      sentences.push({ sentence, startsParagraph: i === 0 });
    });
  }

  const chunks = [];
  let current = "";
  for (const { sentence, startsParagraph } of sentences) {
    const limit = Math.min(max, first * 2 ** chunks.length);
    const joined = current ? current + (startsParagraph ? "\n\n" : " ") + sentence : sentence;
    if (current && joined.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current = joined;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
