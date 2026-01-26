# Configuring LLM Provider API Key

This guide explains how to configure the API key for your preferred Large Language Model (LLM) provider. You can set the API key in two ways: by adding it to the `.env` file or through the web interface's **Settings** page.

---

## Option 1: Configure API Key in `.env`

1. Open the `.env` file in the root directory of your project. If the file does not exist, create one by copying from `.env.example`:

   ```bash
   cp .env.example .env
   ```

2. Add the API key for your LLM provider to the `.env` file. For example:

   ```env
   LLM_PROVIDER_API_KEY=your-llm-provider-api-key
   ```

3. Save the file and restart the development server:

   ```bash
   npm run dev
   ```

   The application will now use the API key from the `.env` file.


### Supported model providers
   - OpenAI
   - Anthropic
   - Google Gemini
   - Open Router
   - Groq
   - Cerebras
---

## Option 2: Configure API Key from the Web Interface

1. Start the application and open it in your browser (e.g., `http://localhost:3000`).

2. Navigate to the **Settings** page from the main menu.

3. Locate the **LLM Provider API Key** section.

4. Enter your API key in the provided input field and save the changes.

   The application will now use the API key you configured through the web interface.

---

## Notes

- If both the `.env` file and the web interface are configured, the web interface setting takes precedence.
- Ensure that your API key is valid and has sufficient permissions for the required operations.
- Never commit your `.env` file to version control to avoid exposing sensitive information.
