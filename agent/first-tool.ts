import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// The one tool Claude is allowed to call. The description tells Claude what
// the tool does and when to reach for it; input_schema tells Claude exactly
// what arguments it must supply.
const tools: Anthropic.Tool[] = [
  {
    name: "get_stock",
    description:
      "Get the current stock levels for every slot in a vending machine. " +
      "Returns, for each item, how many are currently stocked and the slot's total capacity.",
    input_schema: {
      type: "object",
      properties: {
        machine_id: {
          type: "string",
          description: "The vending machine's ID, e.g. GYM-01",
        },
      },
      required: ["machine_id"],
    },
  },
];

type Slot = { item: string; count: number; capacity: number };

// A fake "database" lookup — stands in for a real API call to the vending machines.
function getStock(machineId: string): { slots: Slot[] } | { error: string } {
  if (machineId === "GYM-01") {
    return {
      slots: [
        { item: "Water 0.5l", count: 3, capacity: 20 },
        { item: "Protein bar", count: 12, capacity: 15 },
        { item: "Energy drink", count: 0, capacity: 12 },
      ],
    };
  }
  return { error: `No machine found with ID "${machineId}"` };
}

const messages: Anthropic.MessageParam[] = [
  {
    role: "user",
    content:
      "Check machine GYM-01. Which slots need restocking and how many items each?",
  },
];

const MAX_STEPS = 10;
let step = 0;

while (true) {
  step++;
  if (step > MAX_STEPS) {
    console.log(`Stopped after ${MAX_STEPS} steps without a final answer.`);
    break;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    tools,
    messages,
  });

  messages.push({ role: "assistant", content: response.content });

  if (response.stop_reason !== "tool_use") {
    for (const block of response.content) {
      if (block.type === "text") {
        console.log(block.text);
      }
    }
    break;
  }

  const toolResults: Anthropic.ToolResultBlockParam[] = [];
  for (const block of response.content) {
    if (block.type === "tool_use") {
      console.log(`[tool call] ${block.name}(${JSON.stringify(block.input)})`);

      if (block.name === "get_stock") {
        const { machine_id } = block.input as { machine_id: string };
        const result = getStock(machine_id);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
    }
  }

  messages.push({ role: "user", content: toolResults });
}
