import { GoogleGenAI } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

export interface LlmCallConfig {
  model?: string;
  prompt: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Execute a real LLM call via the Google Gemini API.
 * No stub, no canned response — this makes a real API call.
 */
export async function executeLlmCall(
  config: LlmCallConfig,
  previousOutput: any
): Promise<any> {
  const ai = getGeminiClient();

  // Interpolate variables in prompt
  let prompt = config.prompt;
  if (previousOutput) {
    prompt = prompt.replace(/\{\{previous_output\.(\w+)\}\}/g, (_match, key) => {
      return previousOutput[key] !== undefined ? String(previousOutput[key]) : '';
    });
    prompt = prompt.replace(/\{\{previous_output\}\}/g, JSON.stringify(previousOutput));
  }

  const model = config.model || 'gemini-3.6-flash';
  
  // Convert config to Gemini configuration
  const geminiConfig: any = {
    temperature: config.temperature ?? 0.7,
    maxOutputTokens: config.max_tokens ?? 1024,
  };

  if (config.system_prompt) {
    geminiConfig.systemInstruction = config.system_prompt;
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: prompt,
    config: geminiConfig,
  });

  const responseText = response.text || '';

  // Try to parse as JSON; if it fails, return as raw text
  // Some LLMs wrap JSON in markdown blocks, let's try to strip it if present
  let cleanText = responseText;
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.replace(/^```json\n/, '').replace(/\n```$/, '');
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  try {
    return JSON.parse(cleanText);
  } catch {
    return { response: responseText };
  }
}
