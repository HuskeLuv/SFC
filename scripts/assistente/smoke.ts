import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();
const models = ['claude-haiku-4-5', 'claude-sonnet-5'];

async function main() {
  for (const model of models) {
    const t0 = Date.now();
    const { data: res, response: http } = await client.messages
      .create({
        model,
        max_tokens: 60,
        system: 'Você é o assistente do My Finance. Responda em português, em uma frase.',
        messages: [{ role: 'user', content: 'O que é TWR?' }],
      })
      .withResponse();
    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    console.log(
      JSON.stringify(
        {
          model: res.model,
          ms: Date.now() - t0,
          stop: res.stop_reason,
          usage: res.usage,
          org: http.headers.get('anthropic-organization-id'),
          workspace: http.headers.get('anthropic-workspace-id'),
          requestId: http.headers.get('request-id'),
          text: text.slice(0, 140),
        },
        null,
        1,
      ),
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
