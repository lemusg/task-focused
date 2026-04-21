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

function getZaiTextFromResponse(payload: unknown): string {
  const data = payload as {
    choices?: Array<{
      message?: { content?: string };
    }>;
  };

  return data?.choices?.[0]?.message?.content ?? '';
}

// Proxy chat requests from the blocked page to the configured LLM provider.
router.post('/chat', requireGoogleAuth, async (req: Request, res: Response) => {
  const { system, messages } = req.body as ChatRequestBody;

  // Require at least one user/assistant turn before calling the model.
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ message: 'messages must be a non-empty array.' });
    return;
  }

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ message: 'ZAI_API_KEY is not configured.' });
    return;
  }

  try {
    const model = process.env.ZAI_MODEL || 'GLM-4.5';
    const url = 'https://api.z.ai/api/paas/v4/chat/completions';

    const body = {
      model,
      max_tokens: 1024,
      ...(system
        ? {
            system_prompt: system,
          }
        : {}),
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };

    const zaiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const zaiPayload = (await zaiRes.json()) as unknown;
    if (!zaiRes.ok) {
      const details = JSON.stringify(zaiPayload);
      res.status(502).json({ message: `ZAI API request failed (${zaiRes.status}).`, details });
      return;
    }

    const content = getZaiTextFromResponse(zaiPayload);
    res.json({ content });
  } catch (error) {
    console.error('ZAI API error', error);
    res.status(502).json({ message: 'Failed to get response from AI.' });
  }
});

export default router;
