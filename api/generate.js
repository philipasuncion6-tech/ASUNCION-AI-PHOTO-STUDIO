// Vercel serverless endpoint for secure portrait editing.
// Configure OPENAI_API_KEY in Vercel Project Settings > Environment Variables.
const MAX_INPUT_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function clean(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "AI provider key is not configured.",
      code: "AI_PROVIDER_NOT_CONFIGURED",
      message: "Add OPENAI_API_KEY to this Vercel project's Production environment, then redeploy."
    });
  }

  try {
    const body = req.body || {};
    const image = typeof body.image === "string" ? body.image : "";
    const match = image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || !ALLOWED_MIME.has(match[1])) {
      return res.status(400).json({ error: "Upload a PNG, JPEG, or WebP portrait." });
    }

    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > MAX_INPUT_BYTES) {
      return res.status(413).json({ error: "Please use an image smaller than 3 MB." });
    }

    const age = clean(body.age, 40) || "Keep original age";
    const outfit = clean(body.outfit, 80) || "Keep original outfit";
    const world = clean(body.world, 100) || "Keep original background";
    const customAge = clean(body.customAge, 3);
    const customScene = clean(body.customScene, 180);
    const style = clean(body.style, 60) || "Photorealistic";

    const prompt = [
      "Edit the supplied portrait photograph. Create a polished, realistic final photograph, not a collage or illustration.",
      "IDENTITY PRESERVATION: keep the same person's recognizable identity, facial structure, eyes, nose, mouth, skin tone and distinctive features. Do not replace the person or add other people. Keep natural anatomy and realistic hands.",
      "AGE: " + (age === "Custom age" && customAge ? "Depict the same person at approximately " + customAge + " years old." : age + ". If Keep original age, do not change age."),
      "WARDROBE: " + outfit + ". If Keep original outfit, preserve the current clothing.",
      "SETTING: " + (world === "Custom scene" && customScene ? customScene : world) + ". If Keep original background, preserve the existing setting.",
      "VISUAL STYLE: " + style + ".",
      "Maintain a flattering, believable photographic composition, coherent lighting, high detail, and a natural-looking result. Avoid text, watermarks, logos, borders, frames, or captions; the studio adds those locally after generation."
    ].join("\n");

    const form = new FormData();
    form.append("model", "gpt-image-2.6-sunburst");
    form.append("prompt", prompt);
    form.append("quality", "high");
    form.append("size", "1024x1536");
    form.append("output_format", "png");
    form.append("image", new Blob([bytes], { type: match[1] }), "portrait." + (match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1]));

    const upstream = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: form
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const detail = result?.error?.message || "The image provider could not complete this edit.";
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: detail,
        code: upstream.status === 429 ? "AI_RATE_LIMIT" : "AI_PROVIDER_ERROR"
      });
    }

    const output = result?.data?.[0]?.b64_json;
    if (!output) {
      return res.status(502).json({ error: "The AI provider returned no image. Please try again." });
    }
    return res.status(200).json({
      image: "data:image/png;base64," + output,
      revisedPrompt: result.data[0].revised_prompt || null
    });
  } catch (error) {
    return res.status(500).json({ error: "Image generation failed. Please try again." });
  }
}
