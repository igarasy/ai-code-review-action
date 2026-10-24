import * as core from '@actions/core';
import Anthropic from '@anthropic-ai/sdk';
import { run } from './main.js';

run().catch((error: unknown) => {
  if (error instanceof Anthropic.AuthenticationError) {
    core.setFailed('Anthropic API key is invalid or missing (input "anthropic-api-key").');
  } else if (error instanceof Anthropic.RateLimitError) {
    core.setFailed('Anthropic API rate limit reached after retries. Try again later or lower max-diff-chars.');
  } else if (error instanceof Anthropic.BadRequestError) {
    core.setFailed(`Anthropic API rejected the request: ${error.message}`);
  } else if (error instanceof Anthropic.APIError) {
    core.setFailed(`Anthropic API error ${error.status ?? ''}: ${error.message}`);
  } else {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
});
