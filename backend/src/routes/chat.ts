import { Router, type Request, type Response } from 'express';
import OpenAI from 'openai';
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

router.post('/chat', requireGoogleAuth, async (req: Request, res: Response) => {
  const { system, messages } = req.body as ChatRequestBody;

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
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.z.ai/api/paas/v4',
    });

    const result = await client.chat.completions.create({
      model: 'GLM-4.5',
      messages: [
        ...(system ? [{ role: 'system' as const, content: system }] : []),
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
    });

    const content = result.choices[0]?.message?.content ?? '';
    res.json({ content });
  } catch (error) {
    console.error('Z.AI API error', error);
    res.status(502).json({ message: 'Failed to get response from AI.' });
  }
});

export default router;
