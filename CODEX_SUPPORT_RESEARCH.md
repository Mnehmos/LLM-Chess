# Codex Support Research (March 7, 2026)

## What We Verified (Official OpenAI Sources)

1. Codex access in ChatGPT is tied to ChatGPT plans (`Plus`, `Pro`, `Business`, `Edu`, `Enterprise`), and Codex is also available in the `Codex CLI`.
   - Source: https://help.openai.com/en/articles/11752874-codex-in-chatgpt
2. API-based integration requires OpenAI API credentials and usage limits/pricing are separate from ChatGPT app plans.
   - Source: https://help.openai.com/en/articles/11752874-codex-in-chatgpt
   - Source: https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key
3. Current Codex model docs include `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1-codex`, and `gpt-5-codex` families.
   - Source: https://platform.openai.com/docs/models/gpt-5.3-codex
   - Source: https://platform.openai.com/docs/models/gpt-5.2-codex
   - Source: https://platform.openai.com/docs/models/gpt-5.1-codex
   - Source: https://platform.openai.com/docs/models/gpt-5-codex
4. Endpoint support differs by model generation. Some Codex models are documented as Responses-API-only, while others support Chat Completions.
   - Source: https://platform.openai.com/docs/models/gpt-5-codex
   - Source: https://platform.openai.com/docs/models/gpt-5.2-codex
   - Source: https://platform.openai.com/docs/models/gpt-5.3-codex

## Implementation Choices in This Repo

1. Added provider support for both `OpenRouter` and `OpenAI` so Codex models can run directly from OpenAI API keys.
2. Added Codex subscription-plan selection in settings as benchmark metadata (plan tracking), while runtime still authenticates with API keys.
3. Added Codex-focused featured models for both providers in the model picker.
4. Kept existing OpenRouter flows intact while routing runtime/commentary/model listing through a provider-aware client factory.

## Important Caveat

This app is API-key based. ChatGPT subscription access (without API keys) is not used directly by this codebase.
