// Vercel serverless endpoint for portrait editing with Cloudflare Workers AI.
// Configure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Vercel Production env vars.
const MAX_INPUT_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

function clean(value, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!apiToken || !accountId) {
    return res.status(503).json({
      error: "Free AI provider is not connected yet.",
      code: "CLOUDFLARE_NOT_CONFIGURED",
      message: "Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to this Vercel project's Production environment, then redeploy."
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

    const exactAgeFromOption = age.match(/^(\d{1,3})\s+years old$/i);
    const targetAge = age === "Custom age"
      ? Number(customAge)
      : exactAgeFromOption
        ? Number(exactAgeFromOption[1])
        : null;
    const hasExactTargetAge = Number.isInteger(targetAge) && targetAge >= 1 && targetAge <= 100;
    const ageInstruction = age === "Keep original age"
      ? "AGE: Keep the person's current age and age-related appearance unchanged."
      : hasExactTargetAge
        ? "AGE TRANSFORMATION: Depict the SAME person at approximately " + targetAge + " years old. Make the age change clearly visible and age-appropriate, not just a beauty filter or skin smoothing. " +
          (targetAge <= 25
            ? "Give the person a believable youthful appearance for this exact age: naturally youthful skin texture, age-appropriate facial fullness and contours, and no age lines, age spots, or age-related sagging inconsistent with the target age. Avoid making the person look like a child when the target is 18."
            : "Adjust age-related skin texture, facial fullness, and other visible age cues naturally for the requested age.")
        : "AGE RANGE: " + age + ". Choose a believable age within this range while keeping the same recognizable person.";
    const prompt = [
      "Edit reference image 0 into one polished, photorealistic photograph. Reference image 0 is the identity source and must remain the same person. Do not replace the person, blend in another face, or add other people.",
      "IDENTITY IS THE HIGHEST PRIORITY: preserve the person's recognizable identity and distinctive facial landmarks—overall face outline, eye shape and spacing, eyebrows, nose bridge and tip, lip shape, smile, jaw/chin character, skin tone, and any visible distinguishing marks. The result must still look unmistakably like the person in the reference, not a generic attractive model.",
      "Change only the age-related appearance needed for the requested age. Keep the person's core facial structure and identity cues consistent; do not change gender presentation, ethnicity, or skin tone. Avoid excessive beautification, face reshaping, artificial plastic skin, or exaggerated features.",
      ageInstruction,
      "WARDROBE: " + outfit + ". If Keep original outfit, preserve the current clothing.",
      "SETTING: " + (world === "Custom scene" && customScene ? customScene : world) + ". If Keep original background, preserve the existing setting.",
      "VISUAL STYLE: " + style + ".",
      "Create a believable photographic composition with coherent lighting, natural skin detail, and realistic anatomy and hands. Do not add text, watermarks, logos, borders, frames, or captions; the studio adds those locally after generation."
    ].join("\n");

    const form = new FormData();
    form.append("prompt", prompt);
    form.append("input_image_0", new Blob([bytes], { type: match[1] }), "reference." + (match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1]));
    form.append("width", "768");
    form.append("height", "1024");

    const upstream = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/run/" + MODEL,
      {
        method: "POST",
        headers: { Authorization: "Bearer " + apiToken },
        body: form
      }
    );

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result?.success === false) {
      const detail = result?.errors?.[0]?.message || result?.messages?.[0]?.message || result?.error?.message || "Cloudflare Workers AI could not complete this edit.";
      const status = upstream.status === 401 || upstream.status === 403 ? 502 : upstream.status === 429 ? 429 : upstream.status === 400 ? 400 : 502;
      return res.status(status).json({
        error: detail,
        code: upstream.status === 429 ? "AI_RATE_LIMIT" : "CLOUDFLARE_AI_ERROR"
      });
    }

    const output = result?.result?.image;
    if (!output || typeof output !== "string") {
      return res.status(502).json({ error: "The AI provider returned no image. Please try again." });
    }

    return res.status(200).json({
      image: "data:image/png;base64," + output,
      provider: "Cloudflare Workers AI",
      model: MODEL
    });
  } catch (error) {
    return res.status(500).json({ error: "Image generation failed. Please try again." });
  }
}
