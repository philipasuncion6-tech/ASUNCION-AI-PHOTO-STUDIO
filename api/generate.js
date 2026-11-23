// Vercel serverless endpoint. Connect a licensed image-editing provider here.
// Keep provider credentials in Vercel Environment Variables; never expose keys in browser code.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(503).json({
    error: "AI image generation is not connected yet.",
    code: "AI_PROVIDER_NOT_CONFIGURED",
    message: "The studio interface is deployed, but age, clothing and background transformations require a configured image-generation provider and secure server-side credentials."
  });
}