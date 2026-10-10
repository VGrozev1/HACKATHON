import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-5",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: "What are the top 3 things I should consider when deciding what to restock in a vending machine at a gym?",
    },
  ],
});

for (const block of response.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}
