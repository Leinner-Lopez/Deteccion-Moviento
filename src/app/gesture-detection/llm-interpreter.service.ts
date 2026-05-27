import { Injectable } from '@angular/core';
import { GESTURE_CONFIG } from './gesture-config';
import { environment } from '../../environments/environment';
import type { MediaPipeResults } from './mediapipe.service';

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
}

@Injectable({ providedIn: 'root' })
export class LlmInterpreterService {
  private isProcessing = false;
  private lastGestureTime = 0;
  private readonly COOLDOWN_MS = 2000;
  private readonly API_URL = 'https://api.anthropic.com/v1/messages';

  async interpret(results: MediaPipeResults): Promise<string> {
    if (this.isProcessing) return 'none';
    if (Date.now() - this.lastGestureTime < this.COOLDOWN_MS) return 'none';
    if (!results.poseLandmarks?.length && !results.leftHandLandmarks && !results.rightHandLandmarks) {
      return 'none';
    }

    this.isProcessing = true;
    try {
      const gesturesList = GESTURE_CONFIG.map((g) => `- ${g.id}: ${g.description}`).join('\n');

      const keypointsJson = JSON.stringify({
        pose: (results.poseLandmarks ?? [])
          .map((lm, i) => ({ i, x: +lm.x.toFixed(3), y: +lm.y.toFixed(3), v: +lm.visibility.toFixed(2) }))
          .filter((lm) => lm.v > 0.5),
        leftHand: results.leftHandLandmarks?.map((lm, i) => ({
          i,
          x: +lm.x.toFixed(3),
          y: +lm.y.toFixed(3),
        })),
        rightHand: results.rightHandLandmarks?.map((lm, i) => ({
          i,
          x: +lm.x.toFixed(3),
          y: +lm.y.toFixed(3),
        })),
      });

      const prompt = `You are a gesture recognition system. Based on the body pose keypoints provided, identify which gesture from the list is being performed.
Registered gestures:
${gesturesList}
Current pose keypoints (MediaPipe format, normalized 0-1):
${keypointsJson}
Respond ONLY with the gesture id that matches, or "none" if no gesture matches or confidence is low. No explanation, just the id.`;

      const res = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': environment.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 20,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        console.error('Anthropic API error:', res.status);
        return 'none';
      }

      const data: AnthropicResponse = await res.json();
      const response = data.content[0]?.text?.trim().toLowerCase() ?? 'none';
      const validIds = new Set(GESTURE_CONFIG.map((g) => g.id));
      const gestureId = validIds.has(response) ? response : 'none';

      if (gestureId !== 'none') this.lastGestureTime = Date.now();
      return gestureId;
    } catch (err) {
      console.error('LLM error:', err);
      return 'none';
    } finally {
      this.isProcessing = false;
    }
  }
}
