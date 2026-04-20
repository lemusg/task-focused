import { Router, type Request, type Response } from 'express';
import { requireGoogleAuth } from '../middleware/requireGoogleAuth';

const router = Router();

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatRequestBody = {
  system?: string;
  messages?: Message[];
};

type GeminiRole = 'user' | 'model';

function toGeminiRole(role: Message['role']): GeminiRole {
  return role === 'assistant' ? 'model' : 'user';
}

function getGeminiTextFromResponse(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? '').join('').trim();
}

// Proxy chat requests from the blocked page to the configured LLM provider.
router.post('/chat', requireGoogleAuth, async (req: Request, res: Response) => {
  const { system, messages } = req.body as ChatRequestBody;

  // Require at least one user/assistant turn before calling the model.
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ message: 'messages must be a non-empty array.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ message: 'GEMINI_API_KEY is not configured.' });
    return;
  }

  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

    const body = {
      ...(system
        ? {
            systemInstruction: {
              role: 'system',
              parts: [{ text: system }],
            },
          }
        : {}),
      contents: messages.map((m) => ({
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }],
      })),
    };

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const geminiPayload = (await geminiRes.json()) as unknown;
    if (!geminiRes.ok) {
      const details = JSON.stringify(geminiPayload);
      res.status(502).json({ message: `Gemini API request failed (${geminiRes.status}).`, details });
      return;
    }

    const content = getGeminiTextFromResponse(geminiPayload);
    res.json({ content });
  } catch (error) {
    console.error('Gemini API error', error);
    res.status(502).json({ message: 'Failed to get response from AI.' });
  }
});

export default router;
