/**
 * Diagnostic test: validates the Gemini code analysis model in isolation.
 * Creates a synthetic code screenshot and sends it directly to the model.
 *
 * Usage: npx tsx scripts/test-screen-pipeline.ts
 */
import 'dotenv/config'
import { GoogleGenerativeAI } from '@google/generative-ai'

const API_KEY = process.env.GEMINI_API_KEY
if (!API_KEY) {
  console.error('GEMINI_API_KEY not set')
  process.exit(1)
}

// Create a tiny 1x1 white PNG as a minimal test (we'll also test with the real prompt)
// But what we really want to test is: does the model respond correctly to code in text?
async function main() {
  const ai = new GoogleGenerativeAI(API_KEY!)

  console.log('=== Test 1: gemini-2.5-flash with thinking (thinkingBudget: 2048) ===')
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: [
      'You analyze screenshots during a live technical interview.',
      'If code or a programming problem is visible, set detected=true and provide a complete solution.',
      'If no coding content, set detected=false.',
      'Return ONLY JSON: {"detected": boolean, "language": string, "suggestion": string}'
    ].join('\n'),
    generationConfig: {
      temperature: 1,
      // @ts-ignore
      thinkingConfig: { thinkingBudget: 2048 }
    }
  })

  // Test with a text-only prompt (simulates what would happen with an image)
  console.log('\n--- Text-only test (should detect code) ---')
  const t0 = Date.now()
  try {
    const result = await model.generateContent([
      { text: 'The user\'s screen shows a LeetCode page with this problem:\n\n"Two Sum: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target."\n\nAnd a code editor with Python selected.\n\nReturn the JSON.' }
    ])
    const raw = result.response.text().trim()
    console.log(`Response (${Date.now() - t0}ms):`, raw.slice(0, 500))
  } catch (err: any) {
    console.error(`Error (${Date.now() - t0}ms):`, err.message)
  }

  console.log('\n--- Text-only test (should NOT detect code) ---')
  const t1 = Date.now()
  try {
    const result = await model.generateContent([
      { text: 'The user\'s screen shows a Gmail inbox with emails about scheduling meetings.\n\nReturn the JSON.' }
    ])
    const raw = result.response.text().trim()
    console.log(`Response (${Date.now() - t1}ms):`, raw.slice(0, 500))
  } catch (err: any) {
    console.error(`Error (${Date.now() - t1}ms):`, err.message)
  }

  // Test model without thinking for comparison
  console.log('\n\n=== Test 2: gemini-2.5-flash WITHOUT thinking ===')
  const model2 = ai.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: [
      'You analyze screenshots during a live technical interview.',
      'If code or a programming problem is visible, set detected=true and provide a complete solution.',
      'If no coding content, set detected=false.',
      'Return ONLY JSON: {"detected": boolean, "language": string, "suggestion": string}'
    ].join('\n'),
    generationConfig: {
      temperature: 0.2,
      // @ts-ignore
      thinkingConfig: { thinkingBudget: 0 }
    }
  })

  console.log('\n--- Text-only test (should detect code) ---')
  const t2 = Date.now()
  try {
    const result = await model2.generateContent([
      { text: 'The user\'s screen shows a LeetCode page with this problem:\n\n"Two Sum: Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target."\n\nAnd a code editor with Python selected.\n\nReturn the JSON.' }
    ])
    const raw = result.response.text().trim()
    console.log(`Response (${Date.now() - t2}ms):`, raw.slice(0, 500))
  } catch (err: any) {
    console.error(`Error (${Date.now() - t2}ms):`, err.message)
  }

  console.log('\n\nDone. If both model configs return correct JSON, the issue is in image capture, not the model.')
}

main().catch(console.error)
